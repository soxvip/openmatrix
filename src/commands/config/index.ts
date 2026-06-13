import type { Command } from '../../commands.js'

const config = {
  aliases: ['settings'],
  type: 'local-jsx',
  name: 'config',
  description: 'Abre o painel de configuração',
  load: () => import('./config.js'),
} satisfies Command

export default config
