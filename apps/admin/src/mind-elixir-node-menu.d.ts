// @mind-elixir/node-menu не поставляет типы — объявляем плагин для install() (#7).
declare module '@mind-elixir/node-menu' {
  import type { MindElixirInstance } from 'mind-elixir';
  const nodeMenu: (instance: MindElixirInstance) => void;
  export default nodeMenu;
}
