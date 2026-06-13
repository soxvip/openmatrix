import type { Command } from '../../commands.js'

const outputStyle = {
  type: 'local-jsx',
  name: 'output-style',
  description: 'Obsoleto: use /config para alterar o estilo de saída',
  isHidden: true,
  load: () => import('./output-style.js'),
} satisfies Command

export default outputStyle
