import type { Command } from '../../commands.js'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  aliases: ['allowed-tools'],
  description: 'Gerencia regras de permissão de ferramentas (allow e deny)',
  load: () => import('./permissions.js'),
} satisfies Command

export default permissions
