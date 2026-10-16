import { RepositorioArquivo } from './persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from './persistence/JournalTransacao.js';
import { ServicoProvisionamento } from './services/ServicoProvisionamento.js';
import { ServicoAutenticacao } from './services/ServicoAutenticacao.js';
import { ServicoOrganizacao } from './services/ServicoOrganizacao.js';
import { ServicoLoteEquipamento } from './services/ServicoLoteEquipamento.js';
import { ServicoUsuario } from './services/ServicoUsuario.js';
import { ServicoRelatorio } from './services/ServicoRelatorio.js';
import { CLIInterface } from './cli/CLIInterface.js';

const DATA_DIR = './data';

async function main() {
  console.log('==============================================');
  console.log('       GREENCODE - LOGÍSTICA REVERSA CLI      ');
  console.log('==============================================');

  // 1. Boot de Provisionamento
  const provisionamento = new ServicoProvisionamento(DATA_DIR);
  let chaveMestra: string;

  if (provisionamento.precisaProvisionar()) {
    console.log('\n[PROVISIONAMENTO INICIAL DETECTADO]');
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const senhaAdmin = await new Promise<string>((res) =>
      readline.question('Defina a senha do ADMINISTRADOR inicial: ', res)
    );
    readline.close();

    const resultado = provisionamento.executarProvisionamento(senhaAdmin);
    chaveMestra = resultado.chaveMestra;
    console.log('✔ Provisionamento concluído! Usuário inicial: "admin"\n');
  } else {
    chaveMestra = provisionamento.carregarChaveMestra();
  }

  // 2. Instanciação da Infraestrutura e Serviços
  const journal = new JournalTransacaoService(DATA_DIR);
  const repo = new RepositorioArquivo(DATA_DIR, chaveMestra);
  const authService = new ServicoAutenticacao(repo, journal);
  const orgService = new ServicoOrganizacao(repo, journal);
  const loteService = new ServicoLoteEquipamento(repo, journal);
  const usuarioService = new ServicoUsuario(repo, journal);
  const relatorioService = new ServicoRelatorio(repo, DATA_DIR);

  // 3. Inicia a Camada de Apresentação
  const cli = new CLIInterface(
    authService,
    orgService,
    loteService,
    usuarioService,
    relatorioService
  );

  await cli.iniciarLoop();
}

main();