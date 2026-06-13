import type { Command } from '../../commands.js'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  description: 'Mostra suas estatísticas de uso e atividade do OPEN MATRIX',
  load: () => import('./stats.js'),
} satisfies Command

export default stats
