import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STATIC_ROOT = path.join(__dirname, '..', '..', 'static');
export const PERSONAGEM_DIR = path.join(STATIC_ROOT, 'personagem');

export const ALLOWED_FRAMES = ['meio', 'direito', 'esquerdo'] as const;

export const FOLDER_REGEX = /^[A-Za-z0-9_\\-]+$/;

export const FOLDERS: Record<string, string> = {
  amarelo: '#FFD400',
  azul_escuro: '#003366',
  ciano: '#00FFFF',
  laranja: '#FF8C00',
  marron: '#8B4513',
  verde_claro: '#66FF66',
  verde_escuro: '#006400',
  vermelho: '#C50A0A',
};
