// static/map.js
class GameMap {
  constructor() {
    this.SCALE = 9; // escala (5x SVG original)
    this.BASE_W = 1024;
    this.BASE_H = 768;
    this.width = this.BASE_W * this.SCALE;
    this.height = this.BASE_H * this.SCALE;

    this.canvas = null;
    this.ctx = null;
    this.imageData = null; // Uint8ClampedArray para colisão (baseado apenas no SVG)
    this.ready = false;

    // modo: se true checa alpha==0 como "caminhável".
    // se false usa brilho invertido (caso prefira outra arte onde
    // área escura é caminhável)
    this.useAlphaForWalk = true;
    // brightness threshold (apenas usado se useAlphaForWalk == false)
    this.brightnessThreshold = 30;

    // Caminho para o PNG de fundo (chão). Ajuste se necessário.
    this.floorSrc = '/static/floor.png';
  }

  async load() {
    const loadImg = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        // importante: permitir carregar com crossOrigin se necessário
        // img.crossOrigin = 'anonymous';
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = (e) =>
          reject('Erro ao carregar imagem: ' + src + ' - ' + e);
      });

    try {
      const [svgImg, floorImg] = await Promise.all([
        loadImg('/public/mapa.svg'),
        loadImg(this.floorSrc),
      ]);

      // Canvas para colisão: apenas o SVG (para preservar alpha transparente nos buracos)
      const collCanvas = document.createElement('canvas');
      collCanvas.width = this.width;
      collCanvas.height = this.height;
      const collCtx = collCanvas.getContext('2d');
      collCtx.drawImage(svgImg, 0, 0, this.width, this.height);
      const collImgd = collCtx.getImageData(0, 0, this.width, this.height);
      this.imageData = collImgd.data; // Usado para isWalkable

      // Canvas visual: PNG de fundo + SVG por cima
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');

      // Desenha PNG de fundo escalado
      this.ctx.drawImage(floorImg, 0, 0, this.width, this.height);

      // Desenha SVG por cima (partes transparentes do SVG mostram o PNG abaixo)
      this.ctx.drawImage(svgImg, 0, 0, this.width, this.height);

      this.ready = true;
      console.log('Mapa carregado! Tamanho:', this.width + '×' + this.height);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // retorna brilho médio 0-255 e também o alpha (0-255)
  getPixelRGBA(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height)
      return { r: 0, g: 0, b: 0, a: 255 };
    const i = (y * this.width + x) * 4;
    const r = this.imageData[i];
    const g = this.imageData[i + 1];
    const b = this.imageData[i + 2];
    const a = this.imageData[i + 3];
    const brightness = Math.round((r + g + b) / 3);
    return { r, g, b, a, brightness };
  }

  draw(mainCtx, cameraX, cameraY) {
    if (!this.ready) return;
    mainCtx.drawImage(this.canvas, -cameraX, -cameraY);
  }

  // nova isWalkable: verifica vários pontos em volta do círculo (radius)
  // se useAlphaForWalk == true -> alpha == 0 é caminhável (buraco)
  // se useAlphaForWalk == false -> considera brilho < threshold como caminhável (modo antigo invertido)
  isWalkable(x, y, radius = 20) {
    if (!this.ready) return false;
    const points = 12;
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * radius);
      const py = Math.round(y + Math.sin(a) * radius);

      // fora do mapa -> não caminhável
      if (px < 0 || py < 0 || px >= this.width || py >= this.height)
        return false;

      const { a: alpha, brightness } = this.getPixelRGBA(px, py);

      if (this.useAlphaForWalk) {
        // alpha==0: transparente => buraco => caminhável
        // se alguma amostra NÃO for alpha==0 -> colidiu com parede
        if (alpha !== 0) return false;
      } else {
        // modo brilho invertido (áreas escuras caminháveis)
        if (brightness >= this.brightnessThreshold) return false;
      }
    }
    return true;
  }
}
