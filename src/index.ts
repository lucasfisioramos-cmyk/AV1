import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

import { ServicoProvisionamento } from './services/ServicoProvisionamento.js';
import { RepositorioArquivo } from './persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from './persistence/JournalTransacao.js';
import { ServicoAutenticacao } from './services/ServicoAutenticacao.js';
import { ServicoUsuario } from './services/ServicoUsuario.js';
import { ServicoOrganizacao } from './services/ServicoOrganizacao.js';
import { ServicoLoteEquipamento } from './services/ServicoLoteEquipamento.js';
import { ServicoRelatorio } from './services/ServicoRelatorio.js';
import { CLIInterface } from './cli/CLIInterface.js';
import { CriptografiaArquivo } from './security/CriptografiaArquivo.js';

async function bootstrap() {
  console.log('==================================================');
  console.log('       GREENCODE - LOGÍSTICA REVERSA EEE        ');
  console.log('==================================================\n');

  const diretorioDados = path.resolve('./data');
  if (!fs.existsSync(diretorioDados)) {
    fs.mkdirSync(diretorioDados, { recursive: true });
  }

  // 1. Instancia o Serviço de Provisionamento
  const servicoProvisionamento = new ServicoProvisionamento(diretorioDados);
  let chaveMestra: string;

  // 2. Verifica se precisa de provisionamento inicial
  if (servicoProvisionamento.precisaProvisionar()) {
    console.log('--- PROVISIONAMENTO INICIAL DO SISTEMA ---');
    console.log('Nenhuma chave mestra encontrada. Configurando administrador inicial...\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const pergunta = (query: string): Promise<string> =>
      new Promise((resolve) => rl.question(query, resolve));

    const senhaAdmin = await pergunta('Defina a senha do Administrador Inicial (admin): ');
    rl.close();

    const resultado = servicoProvisionamento.executarProvisionamento(senhaAdmin);
    chaveMestra = resultado.chaveMestra;

    console.log('\n✔ Provisionamento concluído com sucesso!\n');
  } else {
    // Sistema já provisionado: apenas carrega a chave mestra existente
    chaveMestra = servicoProvisionamento.carregarChaveMestra();
  }

  // 3. Camada de Persistência e Auditoria
  const repositorio = new RepositorioArquivo(diretorioDados, chaveMestra);
  const journal = new JournalTransacaoService(chaveMestra, diretorioDados);

  // 4. Instancia os Serviços de Domínio
  const servicoAutenticacao = new ServicoAutenticacao(repositorio, journal);
  const servicoUsuario = new ServicoUsuario(repositorio, journal);
  const servicoOrganizacao = new ServicoOrganizacao(repositorio, journal);
  const servicoLoteEquipamento = new ServicoLoteEquipamento(repositorio, journal);
  const servicoRelatorio = new ServicoRelatorio(repositorio, journal);

  // 5. Interface de Linha de Comando
  const cli = new CLIInterface(
    servicoAutenticacao,
    servicoOrganizacao,
    servicoLoteEquipamento,
    servicoUsuario,
    servicoRelatorio
  );

  // 6. Inicia o Loop do Terminal
  await cli.iniciarLoop();
}

bootstrap().catch((erro) => {
  console.error('\n❌ [FALHA CRÍTICA NA INICIALIZAÇÃO]:', erro.message);
  process.exit(1);
});