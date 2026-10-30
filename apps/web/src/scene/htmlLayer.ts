/**
 * Camada fixa onde as etiquetas `Html` do drei são montadas (prop `portal`). Ela fica no `App`,
 * fora do canvas, e nunca é desmontada: por padrão o drei põe as etiquetas no pai do canvas, e ao
 * sair da mesa o canvas saía da página antes delas (erro `removeChild` no build de produção).
 * Cobre a tela inteira como o canvas, então as posições calculadas pelo drei continuam valendo.
 */
export const HTML_LAYER_ID = 'camada-html';

export const htmlLayer = {
  get current(): HTMLElement {
    return document.getElementById(HTML_LAYER_ID)!;
  },
};
