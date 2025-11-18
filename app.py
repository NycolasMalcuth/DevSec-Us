from flask import Flask, render_template, request, redirect, url_for, send_file
from flask_socketio import SocketIO, join_room, leave_room, emit
import uuid
import re
import os
from typing import Dict, Any, Tuple, Optional, List

# --- Constantes Globais ---
STATIC_ROOT: str = os.path.join(os.path.dirname(__file__), "static")
PERSONAGEM_DIR: str = os.path.join(STATIC_ROOT, "personagem")
ALLOWED_FRAMES: List[str] = ["meio", "direito", "esquerdo"]
# Melhoria: Regex para garantir que o nome da pasta é seguro (apenas letras, números, '_' ou '-')
FOLDER_REGEX: str = r"^[A-Za-z0-9_\-]+$"

# --- App ---
app = Flask(__name__)
# Melhoria: Uso de variável de ambiente para a chave secreta (melhor prática de segurança)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'mude-esta-chave-para-producao-padrao-dev')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- Pastas de cor suportadas e cores hex para preview/UI ---
FOLDERS: Dict[str, str] = {
    "amarelo": "#FFD400",
    "azul_escuro": "#003366",
    "ciano": "#00FFFF",
    "laranja": "#FF8C00",
    "marron": "#8B4513",
    "verde_claro": "#66FF66",
    "verde_escuro": "#006400",
    "vermelho": "#C50A0A",
}

# --- Estruturas em memória (simples) ---
rooms: Dict[str, Dict[str, Dict[str, Any]]] = {}
sid_map: Dict[str, Tuple[str, str]] = {}
player_meta: Dict[str, Dict[str, str]] = {}  # player_id -> {'name':..., 'folder':..., 'color_hex':...}


# --- Funções Auxiliares (Melhoria: Centralização da lógica de auxílio) ---
def get_player_data(player_id: str) -> Optional[Dict[str, str]]:
    """Centraliza a recuperação dos metadados do jogador."""
    return player_meta.get(player_id)

def clean_input_string(value: Optional[str], default: str) -> str:
    """Limpa e padroniza strings de input (remove espaços e garante valor)."""
    return str(value).strip() if value else default

def pop_player_from_structures(room: str, player_id: str):
    """
    Melhoria: Função auxiliar para remover um jogador de todas as estruturas
    globais (rooms, sid_map, player_meta).
    Reduz a repetição de código em on_leave e on_disconnect (DRY).
    """
    if room in rooms and player_id in rooms[room]:
        del rooms[room][player_id]

        # Cleanup sid_map
        sids_to_remove = [s for s, tup in sid_map.items() if tup == (room, player_id)]
        for s in sids_to_remove:
            sid_map.pop(s, None)
        
        player_meta.pop(player_id, None)

        if not rooms[room]:
            rooms.pop(room, None)

# --- Rotas web ---
@app.route("/")
def login():
    """Rota de login. Lista as pastas/cores disponíveis."""
    return render_template("login.html", folders=sorted(FOLDERS.keys()))


@app.route("/join", methods=["POST"])
def do_join():
    """Processa o formulário de login e redireciona para a sala."""
    # Melhoria: Uso da função auxiliar clean_input_string para sanitizar input
    room = clean_input_string(request.form.get("room"), "")
    name = clean_input_string(request.form.get("name"), "Player")
    color_folder = clean_input_string(request.form.get("hat_color"), "")

    if not room:
        return redirect(url_for("login"))

    return redirect(url_for("room", room_id=room, name=name, color=color_folder))


@app.route("/room/<room_id>")
def room(room_id: str):
    """Renderiza a tela da sala de jogo."""
    name = request.args.get("name", "Player")
    color_folder = request.args.get("color") or ""
    return render_template("room.html", room_id=room_id, name=name, color=color_folder, folders=sorted(FOLDERS.keys()))


@app.route("/avatar/<player_id>/<frame>.svg")
def avatar_svg(player_id: str, frame: str):
    """
    Rota segura e dinâmica para servir SVGs do personagem.
    Melhoria: Proteção mais rigorosa contra Path Traversal.
    """
    if frame not in ALLOWED_FRAMES:
        return "Not found", 404

    meta = get_player_data(player_id)
    if not meta:
        return "Not found", 404

    folder = meta.get("folder")
    
    # Melhoria: Valida se a pasta é segura (deve ter sido sanitizada em on_join)
    if not folder or not re.fullmatch(FOLDER_REGEX, folder):
        return "Not found", 404

    # Construção do caminho seguro
    base_dir = os.path.join(PERSONAGEM_DIR, folder)
    candidate_path = os.path.join(base_dir, f"{frame}.svg")
    
    # Melhoria: Proteção explícita contra path traversal usando os.path.commonpath
    if not os.path.commonpath([base_dir, candidate_path]) == base_dir:
        return "Security error: Path traversal attempt blocked", 403

    if not os.path.isfile(candidate_path):
        return "Not found", 404

    return send_file(candidate_path, mimetype="image/svg+xml", conditional=True)


# --- SocketIO handlers ---
@socketio.on("join")
def on_join(data: Dict[str, Any]):
    """Handler para a entrada de um jogador na sala."""
    sid: Optional[str] = request.sid

    # 1. Validação de Input
    room = clean_input_string(data.get("room"), "")
    if not room or not sid:
        return

    player_id = str(uuid.uuid4())
    name = clean_input_string(data.get("name"), "Player")
    
    # 2. Sanitização da Pasta (Folder)
    folder = clean_input_string(data.get("color"), "")
    
    # Melhoria: Garante que a pasta é válida (está na nossa lista FOLDERS).
    # Remove a lógica de fallback para diretórios não listados, tornando FOLDERS a única fonte de verdade.
    if folder not in FOLDERS:
        # Fallback rigoroso para a primeira cor válida
        folder = next(iter(FOLDERS.keys()))
    
    color_hex = FOLDERS[folder]

    # 3. Processamento de Sala
    try:
        join_room(room)
        sid_map[sid] = (room, player_id)
    except Exception as e:
        print(f"Erro ao juntar à sala: {e}")
        return

    # 4. Guardar Metadados
    player_meta[player_id] = {"name": name, "folder": folder, "color_hex": color_hex}

    if room not in rooms:
        rooms[room] = {}
    
    # 5. Validação de Coordenadas
    try:
        # Melhoria: Uso do 0.0 explícito como fallback para garantir float
        x = float(data.get("x") or 0.0)
        y = float(data.get("y") or 0.0)
    except (TypeError, ValueError):
        x = 0.0
        y = 0.0

    # 6. Adicionar Jogador à Sala
    rooms[room][player_id] = {"x": x, "y": y, "name": name, "folder": folder, "color": color_hex}

    # 7. Notificações
    emit("joined", {"player_id": player_id, "players": rooms[room]}, to=sid)

    # Notifica os outros na sala com a pasta/color
    emit(
        "player_joined",
        {"player_id": player_id, "x": x, "y": y, "name": name, "folder": folder, "color": color_hex},
        room=room,
        include_self=False,
    )


@socketio.on("pos_update")
def on_pos_update(data: Dict[str, Any]):
    """Handler para a atualização da posição de um jogador."""
    room = data.get("room")
    player_id = data.get("player_id")

    # 1. Validação de Input
    if not isinstance(room, str) or not isinstance(player_id, str):
        return
    
    player_data = rooms.get(room, {}).get(player_id)
    if player_data is None:
        return # Jogador não existe na sala

    # 2. Validação de Coordenadas
    try:
        # Melhoria: Usa os valores existentes do jogador como fallback em caso de erro no input
        x = float(data.get("x", player_data.get("x", 0)))
        y = float(data.get("y", player_data.get("y", 0)))
    except (TypeError, ValueError):
        return

    # 3. Atualizar Posição e Dados
    player_data["x"] = x
    player_data["y"] = y
    
    # Melhoria: Sanitização da atualização de nome
    if "name" in data:
        player_data["name"] = clean_input_string(data.get("name"), player_data.get("name", "Player"))
    
    if "folder" in data:
        f = clean_input_string(data.get("folder"), player_data.get("folder", ""))
        # Melhoria: Apenas permite a atualização se o novo valor estiver na lista FOLDERS (segurança)
        if f in FOLDERS:
            player_data["folder"] = f
            player_data["color"] = FOLDERS[f]

    # 4. Emitir atualização para outros clientes
    emit(
        "player_moved",
        {
            "player_id": player_id,
            "x": x,
            "y": y,
            "facingRight": data.get("facingRight"),
            "currentFrame": data.get("currentFrame"),
        },
        room=room,
        include_self=False,
    )


@socketio.on("leave")
def on_leave(data: Dict[str, Any]):
    """Handler para quando um jogador sai explicitamente da sala."""
    room = data.get("room")
    player_id = data.get("player_id")
    if not (isinstance(room, str) and isinstance(player_id, str)):
        return
    
    was_in_room = room in rooms and player_id in rooms[room]
    # Melhoria: Usa a função auxiliar para cleanup
    pop_player_from_structures(room, player_id)

    if was_in_room:
        try:
            leave_room(room)
        except Exception:
            pass
        # Notifica os restantes
        emit("player_left", {"player_id": player_id}, room=room, include_self=False)


@socketio.on("disconnect")
def on_disconnect():
    """Handler para quando um cliente perde a conexão."""
    sid: Optional[str] = request.sid
    if sid is None:
        return

    entry = sid_map.pop(sid, None)
    if not entry:
        return
        
    room, player_id = entry

    # Melhoria: Usa a função auxiliar para cleanup, reduzindo a repetição de código
    pop_player_from_structures(room, player_id)

    # Notifica os restantes
    emit("player_left", {"player_id": player_id}, room=room, include_self=False)


# --- Run server ---
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
