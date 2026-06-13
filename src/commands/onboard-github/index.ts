import type { Command } from '../../commands.js'

const onboardGithub: Command = {
  name: 'onboard-github',
  aliases: ['onboarding-github', 'onboardgithub', 'onboardinggithub'],
  description:
    'Configuração interativa do GitHub Copilot: login de dispositivo OAuth armazenado em armazenamento seguro',
  type: 'local-jsx',
  load: () => import('./onboard-github.js'),
}

export default onboardGithub
