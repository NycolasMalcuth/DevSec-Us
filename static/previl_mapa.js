let preview = null;
let updateInterval = null;
let lastPosX = 0;
let lastPosY = 0;
let svgViewBoxWidth = null;
let svgViewBoxHeight = null;
let offsetX = -1200; // Valor inicial ajustado para X
let offsetY = 100;   // Valor inicial ajustado para Y
let step = 10;       // Valor inicial do pulo (step)

async function loadSvgViewBox() {
  try {
    const response = await fetch('/static/mapa.svg');
    if (!response.ok) throw new Error('Falha ao carregar mapa.svg');
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');
    if (svgElement) {
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const [, , width, height] = viewBox.split(/\s+/).map(Number);
        svgViewBoxWidth = width;
        svgViewBoxHeight = height;
        console.log('ViewBox dimensions loaded:', svgViewBoxWidth, svgViewBoxHeight);
      } else if (svgElement.hasAttribute('width') && svgElement.hasAttribute('height')) {
        svgViewBoxWidth = parseFloat(svgElement.getAttribute('width'));
        svgViewBoxHeight = parseFloat(svgElement.getAttribute('height'));
        console.log('Width/Height attributes loaded:', svgViewBoxWidth, svgViewBoxHeight);
      }
    }
  } catch (error) {
    console.error('Erro ao carregar viewBox do SVG:', error);
  }
}

document.getElementById('map-button').addEventListener('click', async function() {
  if (!localPlayer || !gameMap) return; // Garante que as variáveis existam

  if (preview) {
    // Se já estiver aberto, fecha
    clearInterval(updateInterval);
    preview.remove();
    preview = null;
    return;
  }

  // Carrega o viewBox se ainda não foi carregado
  if (svgViewBoxWidth === null || svgViewBoxHeight === null) {
    await loadSvgViewBox();
  }

  // Carrega o HTML separado
  try {
    const response = await fetch('/static/previl_mapa.html');
    if (!response.ok) throw new Error('Falha ao carregar previl_mapa.html');
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    preview = doc.querySelector('#map-preview');
    if (!preview) throw new Error('Elemento #map-preview não encontrado no HTML');

    document.body.appendChild(preview);

    const img = preview.querySelector('img');
    const dot = preview.querySelector('#player-dot');
    const closeButton = preview.querySelector('#close-button');
    const offsetXMinus = preview.querySelector('#offset-x-minus');
    const offsetXPlus = preview.querySelector('#offset-x-plus');
    const offsetYMinus = preview.querySelector('#offset-y-minus');
    const offsetYPlus = preview.querySelector('#offset-y-plus');
    const resetOffsets = preview.querySelector('#reset-offsets');
    const offsetDisplay = preview.querySelector('#offset-display');
    const stepButtons = preview.querySelectorAll('button[id^="step-"]');

    // Atualiza display de offsets
    function updateDisplay() {
      offsetDisplay.textContent = `Offset X: ${offsetX} | Y: ${offsetY}`;
    }
    updateDisplay();

    // Configura botões de pulo (step)
    stepButtons.forEach(button => {
      button.addEventListener('click', () => {
        step = parseInt(button.textContent, 10);
        stepButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
      });
    });
    // Define o botão de step 10 como ativo inicialmente
    preview.querySelector('#step-10').classList.add('active');

    // Eventos dos botões de ajuste
    offsetXMinus.addEventListener('click', () => {
      offsetX -= step;
      updateDisplay();
    });
    offsetXPlus.addEventListener('click', () => {
      offsetX += step;
      updateDisplay();
    });
    offsetYMinus.addEventListener('click', () => {
      offsetY -= step;
      updateDisplay();
    });
    offsetYPlus.addEventListener('click', () => {
      offsetY += step;
      updateDisplay();
    });
    resetOffsets.addEventListener('click', () => {
      offsetX = -1200;
      offsetY = 100;
      updateDisplay();
    });

    // Fecha ao clicar no X
    closeButton.addEventListener('click', function() {
      clearInterval(updateInterval);
      preview.remove();
      preview = null;
    });

    // Calcula e atualiza a posição do dot (com offsets aplicados)
    function updateDotPosition() {
      if (!preview || !img.complete) return;

      // Usa viewBox dimensions se disponíveis, senão fallback para gameMap
      const mapWidth = svgViewBoxWidth || gameMap.width;
      const mapHeight = svgViewBoxHeight || gameMap.height;

      // Posição ajustada com offsets
      const adjustedPlayerX = localPlayer.x + offsetX;
      const adjustedPlayerY = localPlayer.y + offsetY;

      // Posição proporcional
      const posX = (adjustedPlayerX / mapWidth) * img.clientWidth;
      const posY = (adjustedPlayerY / mapHeight) * img.clientHeight;

      // Só atualiza se mudou (otimização)
      if (posX !== lastPosX || posY !== lastPosY) {
        dot.style.left = `${posX}px`;
        dot.style.top = `${posY}px`;
        lastPosX = posX;
        lastPosY = posY;
      }
    }

    // Atualiza inicialmente após o carregamento da imagem
    img.onload = function() {
      updateDotPosition();
    };

    // Se a imagem já estiver carregada (cache), atualiza imediatamente
    if (img.complete) {
      updateDotPosition();
    }

    // Atualiza em tempo real a cada 50ms (mais fluido, mas otimizado)
    updateInterval = setInterval(updateDotPosition, 50);
  } catch (error) {
    console.error('Erro ao carregar preview do mapa:', error);
  }
});
