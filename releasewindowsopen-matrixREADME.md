# Distribuição OPEN MATRIX para Windows

Esta pasta contém os arquivos de instalação e configuração para distribuir o **OPEN MATRIX** no Windows.

## Métodos de Instalação

### Opção 1: Instalador Executável (.exe) (Recomendado)
Para gerar o instalador executável amigável usando **Inno Setup**:

1. Baixe e instale o [Inno Setup](https://jrsoftware.org/isdl.php).
2. Abra o terminal e compile o script `.iss` executando:
   ```cmd
   iscc OpenMatrix.iss
   ```
   *(Ou abra o arquivo `OpenMatrix.iss` no editor gráfico do Inno Setup e clique em Compile).*
3. O instalador `OpenMatrixInstaller.exe` será gerado na pasta `Output`.
4. Envie o `.exe` aos usuários. Ao executar, o instalador irá copiar os arquivos para a pasta local e adicionar automaticamente o aplicativo ao `PATH` do sistema.

### Opção 2: Script CMD Manual
Os usuários que preferem não usar o instalador executável podem rodar o script manual:

1. Execute o `install.cmd` com dois cliques ou via terminal.
2. Ele copiará a pasta `app` e criará atalhos rápidos em `%LOCALAPPDATA%\Microsoft\WindowsApps`.

## Requisitos do Sistema
- **Node.js** deve estar instalado e disponível no terminal globalmente como `node`.
