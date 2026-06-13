import type { Command } from '../../commands.js'

const ide = {
  type: 'local-jsx',
  name: 'ide',
  description: 'Gerencia integrações de IDE e mostra o status',
  argumentHint: '[open]',
  load: () => import('./ide.js'),
} satisfies Command

export default ide
