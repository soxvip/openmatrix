import type { Command } from '../../commands.js'

const help = {
  type: 'local-jsx',
  name: 'help',
  description: 'Mostra a ajuda e os comandos disponíveis',
  load: () => import('./help.js'),
} satisfies Command

export default help
