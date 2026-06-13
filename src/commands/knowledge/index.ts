import type { Command } from '../../commands.js'

const knowledge: Command = {
  type: 'local',
  name: 'knowledge',
  description: 'Gerencia o Grafo de Conhecimento nativo',
  supportsNonInteractive: true,
  argumentHint: 'enable <yes|no> | clear | status | list',
  load: () => import('./knowledge.js'),
}

export default knowledge
