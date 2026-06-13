import type { Command } from '../../commands.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  description: 'Mostra o QR code para baixar o app móvel do Claude',
  isEnabled: () => false,
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile
