# app.py
from flask import Flask, render_template, request, redirect, url_for, Response, send_file
from flask_socketio import SocketIO, join_room, leave_room, emit
import uuid
from typing import Dict, Any, Tuple, Optional
import re
import os

# --- App ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'mude-esta-chave-para-producao'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- Diretório estático ---
STATIC_ROOT = app.static_folder or os.path.join(os.path.dirname(__file__), "static")
PERSONAGEM_DIR = os.path.join(STATIC_ROOT, "personagem")

# --- Pastas de cor suportadas e cores hex para preview/UI ---
# Atualize a lista se adicionar novas pastas dentro de static/personagem
FOLDERS = {
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


# --- Rotas web ---
@app.route("/")
def login():
    # Envia lista de pastas disponíveis para a tela de login (opcional)
    return render_template("login.html", folders=sorted(FOLDERS.keys()))


@app.route("/join", methods=["POST"])
def do_join():
    room = (request.form.get("room") or "").strip()
    name = (request.form.get("name") or "").strip() or "Player"
    # hat_color agora é o NOME da pasta (ex: 'verde_escuro'), enviado pelo formulário
    color_folder = (request.form.get("hat_color") or "").strip() or ""
    if not room:
        return redirect(url_for("login"))

    # envia o nome da pasta (pode ser vazio -> será tratado na rota /room)
    return redirect(url_for("room", room_id=room, name=name, color=color_folder))


@app.route("/room/<room_id>")
def room(room_id: str):
    name = request.args.get("name", "Player")
    color_folder = request.args.get("color") or ""  # pode ser nome da pasta ou vazio
    # se folder inválida, não prefixamos com '#'; template decide o que fazer
    return render_template("room.html", room_id=room_id, name=name, color=color_folder, folders=sorted(FOLDERS.keys()))


# Rota dinâmica para servir SVGs a partir da pasta do jogador
# Cliente solicita: /avatar/<player_id>/<frame>.svg
# O servidor olha em player_meta[player_id]['folder'] e serve
@app.route("/avatar/<player_id>/<frame>.svg")
def avatar_svg(player_id: str, frame: str):
    allowed_frames = {"meio", "direito", "esquerdo"}
    if frame not in allowed_frames:
        return "Not found", 404

    meta = player_meta.get(player_id, {})
    folder = meta.get("folder")

    # Se a pasta não estiver definida ou não existir, tentamos usar a pasta do 'color' se for um hex (compat)
    if not folder:
        # fallback: se meta tiver 'color_hex', poderia substituir cor no svg base.
        # Para compatibilidade com versões antigas, procuramos pelo arquivo base em PERSONAGEM_DIR/<frame>.svg
        fallback_svg = os.path.join(PERSONAGEM_DIR, f"{frame}.svg")
        if os.path.isfile(fallback_svg):
            return send_file(fallback_svg, mimetype="image/svg+xml", conditional=True)
        return "Not found", 404

    # sanitiza nome da pasta: só permite [a-z0-9_\-]
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", folder):
        return "Not found", 404

    candidate = os.path.join(PERSONAGEM_DIR, folder, f"{frame}.svg")
    # Protege contra path traversal
    candidate_norm = os.path.normpath(candidate)
    if not candidate_norm.startswith(os.path.normpath(os.path.join(PERSONAGEM_DIR, folder))):
        return "Not found", 404

    if not os.path.isfile(candidate_norm):
        return "Not found", 404

    return send_file(candidate_norm, mimetype="image/svg+xml", conditional=True)


# --- SocketIO handlers ---
@socketio.on("join")
def on_join(data: Dict[str, Any]):
    sid_raw: Optional[str] = getattr(request, "sid", None)
    sid: Optional[str] = sid_raw if isinstance(sid_raw, str) else None

    room = data.get("room")
    if not isinstance(room, str) or not room:
        return

    player_id = str(uuid.uuid4())

    name = data.get("name") or "Player"
    folder = data.get("color") or ""  # here 'color' is the folder name sent by client
    # sanitize folder - only allow names in FOLDERS or existing subdir
    if not isinstance(folder, str):
        folder = ""
    folder = folder.strip()
    if folder not in FOLDERS:
        # if folder absent or not in allowed list, try to fallback to a valid existing dir
        if folder and os.path.isdir(os.path.join(PERSONAGEM_DIR, folder)):
            pass  # accept it
        else:
            # choose random default folder
            folder = next(iter(FOLDERS.keys()))

    color_hex = FOLDERS.get(folder, "#C50A0A")

    try:
        join_room(room)
    except Exception:
        pass

    if sid is not None:
        sid_map[sid] = (room, player_id)

    # guarda meta: nome + pasta + hex (para preview)
    player_meta[player_id] = {"name": name, "folder": folder, "color_hex": color_hex}

    if room not in rooms:
        rooms[room] = {}

    try:
        x = float(data.get("x", 0) or 0)
        y = float(data.get("y", 0) or 0)
    except (TypeError, ValueError):
        x = 0.0
        y = 0.0

    # salve também a pasta no dict do jogador que será enviado ao cliente
    rooms[room][player_id] = {"x": x, "y": y, "name": name, "folder": folder, "color": color_hex}

    # envia para o cliente que entrou (target via 'to' com sid)
    if sid is not None:
        emit("joined", {"player_id": player_id, "players": rooms[room]}, to=sid)
    else:
        emit("joined", {"player_id": player_id, "players": rooms[room]})

    # notifica os outros na sala com a pasta/color
    emit(
        "player_joined",
        {"player_id": player_id, "x": x, "y": y, "name": name, "folder": folder, "color": color_hex},
        room=room,
        include_self=False,
    )


@socketio.on("pos_update")
def on_pos_update(data: Dict[str, Any]):
    room = data.get("room")
    player_id = data.get("player_id")
    if not isinstance(room, str) or not isinstance(player_id, str):
        return

    try:
        x = float(data.get("x", 0) or 0)
        y = float(data.get("y", 0) or 0)
    except (TypeError, ValueError):
        return

    if room in rooms and player_id in rooms[room]:
        rooms[room][player_id]["x"] = x
        rooms[room][player_id]["y"] = y
        # opcional: atualiza name/folder/color se enviado
        if "name" in data:
            rooms[room][player_id]["name"] = data.get("name") or rooms[room][player_id].get("name")
        if "folder" in data:
            f = data.get("folder") or rooms[room][player_id].get("folder")
            if isinstance(f, str) and re.fullmatch(r"[A-Za-z0-9_\-]+", f):
                rooms[room][player_id]["folder"] = f
                rooms[room][player_id]["color"] = FOLDERS.get(f, rooms[room][player_id].get("color"))

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
    room = data.get("room")
    player_id = data.get("player_id")
    if not (isinstance(room, str) and isinstance(player_id, str)):
        return

    if room in rooms and player_id in rooms[room]:
        try:
            leave_room(room)
        except Exception:
            pass
        del rooms[room][player_id]

        emit("player_left", {"player_id": player_id}, room=room, include_self=False)

        for s, tup in list(sid_map.items()):
            if tup[1] == player_id and tup[0] == room:
                sid_map.pop(s, None)

        player_meta.pop(player_id, None)

        if not rooms[room]:
            rooms.pop(room, None)


@socketio.on("disconnect")
def on_disconnect():
    sid_raw: Optional[str] = getattr(request, "sid", None)
    sid: Optional[str] = sid_raw if isinstance(sid_raw, str) else None
    if sid is None:
        return

    entry = sid_map.pop(sid, None)
    if not entry:
        return
    room, player_id = entry
    if room in rooms and player_id in rooms[room]:
        del rooms[room][player_id]
        emit("player_left", {"player_id": player_id}, room=room, include_self=False)
        if not rooms[room]:
            rooms.pop(room, None)

    player_meta.pop(player_id, None)


# --- Run server ---
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5500, debug=True)
