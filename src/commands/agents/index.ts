import type { Command } from '../../commands.js'

const agents = {
  type: 'local-jsx',
  name: 'agents',
  description: 'Gerencia configurações de agentes',
  load: () => import('./agents.js'),
} satisfies Command

export default agents
