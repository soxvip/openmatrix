import type { Command } from '../../commands.js'

const rewind = {
  description: `Restaura o código e/ou a conversa para um ponto anterior`,
  name: 'rewind',
  aliases: ['checkpoint'],
  argumentHint: '',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./rewind.js'),
} satisfies Command

export default rewind
