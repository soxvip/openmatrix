import type { Command } from '../../commands.js'

const hooks = {
  type: 'local-jsx',
  name: 'hooks',
  description: 'Visualiza as configurações de hooks para eventos de ferramentas',
  immediate: true,
  load: () => import('./hooks.js'),
} satisfies Command

export default hooks
