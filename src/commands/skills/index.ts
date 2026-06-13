import type { Command } from '../../commands.js'

const skills = {
  type: 'local-jsx',
  name: 'skills',
  description: 'Lista as skills disponíveis',
  load: () => import('./skills.js'),
} satisfies Command

export default skills
