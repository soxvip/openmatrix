import type { Command } from '../../commands.js'

const command = {
  type: 'local',
  name: 'commit-message',
  description: 'Configura o texto de atribuição do commit',
  argumentHint: '[status|off|default|set "text"|co-author <name> <email>]',
  supportsNonInteractive: true,
  load: () => import('./commit-message.js'),
} satisfies Command

export default command
