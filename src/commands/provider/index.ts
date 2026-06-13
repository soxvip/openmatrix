import type { Command } from '../../commands.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'Gerencia perfis de provedores de API',
  load: () => import('./provider.js'),
} satisfies Command

export default provider
