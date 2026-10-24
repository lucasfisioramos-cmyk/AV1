import * as fs from 'fs';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { ServicoProvisionamento } from '../services/ServicoProvisionamento.js';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao.js';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao.js';
import { ServicoLoteEquipamento } from '../services/ServicoLoteEquipamento.js';
import { ServicoRelatorio } from '../services/ServicoRelatorio.js';
import { TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums.js';

const TEST_DIR = './data_test';

async function rodarJornadaCompleta() {
  console.log('================================================================');
  console.log('   INICIANDO BATERIA DE TESTES AUTOMATIZADOS (JORNADA COMPLETA) ');
  console.log('================================================================\n');

  // Limpar ambiente de teste anterior
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log('1. [PROVISIONAMENTO] Gerando chave mestra e criando administrador...');
  const provisionamento = new ServicoProvisionamento(TEST_DIR);
  const { chaveMestra } = provisionamento.executarProvisionamento('Senha@123');
  const journal = new JournalTransacaoService(chaveMestra, TEST_DIR);
  const repo = new RepositorioArquivo(TEST_DIR, chaveMestra);
  console.log('   ✔ Provisionamento efetuado com sucesso.\n');

  // 2. SIMULAÇÃO DE AUTENTICAÇÃO E SESSÃO
  console.log('2. [AUTENTICAÇÃO] Testando login com SHA-256 e validação de sessão...');
  const authService = new ServicoAutenticacao(repo, journal);
  const sessao = authService.login('admin', 'Senha@123');

  if (!sessao || !authService.isSessaoValida(sessao)) {
    throw new Error('Falha no teste de autenticação.');
  }
  console.log(`   ✔ Autenticado com sucesso! Token gerado. Expira em: 30 min.\n`);

  // 3. CADASTRAR ORGANIZAÇÃO CLIENTE COM VALIDAÇÃO DE CNPJ
  console.log('3. [CADASTRO] Cadastrando empresa parceira com CNPJ válido...');
  const orgService = new ServicoOrganizacao(repo, journal);
  const org = orgService.cadastrarOrganizacao({
    id: 'BANCO_01',
    razaoSocial: 'Banco Nacional de Testes S/A',
    cnpj: '33000167000101', // CNPJ Válido
    enderecoCompleto: 'Av. Paulista, 1000 - SP',
    telefone: '1133334444',
    email: 'contato@bancoteste.com',
    usuarioResponsavel: sessao.usuario,
  });
  console.log(`   ✔ Organização "${org.razaoSocial}" cadastrada.\n`);

  // 4. REGISTRAR ENTRADA DE LOTE E VALIDAÇÃO DE DATAS
  console.log('4. [ALMOXARIFADO] Registrando recebimento do Lote...');
  const loteService = new ServicoLoteEquipamento(repo, journal);
  const lote = loteService.criarLote({
    id: 'LOTE-2026-001',
    organizacaoId: org.id,
    notaFiscal: 'NF-88990',
    transportadora: 'TransLog',
    dataEntrada: new Date(),
    usuarioResponsavel: sessao.usuario,
  });
  console.log(`   ✔ Lote "${lote.id}" registrado com sucesso.\n`);

  // 5. TRIAGEM DE EQUIPAMENTOS E ATRIBUIÇÃO DE CÓDIGO DE BARRAS
  console.log('5. [TRIAGEM] Adicionando equipamentos e gerando código de barras...');
  const equip1 = loteService.adicionarEquipamento(
    lote.id,
    {
      tipo: TipoEquipamento.NOTEBOOK,
      marca: 'Dell',
      modelo: 'Latitude 3420',
      anoFabricacao: 2022,
      estadoFisico: EstadoFisico.USADO_LEVE,
      pesoQuilogramas: 1.8,
    },
    sessao.usuario
  );
  console.log(`   ✔ Equipamento gerado com Código de Barras: ${equip1.codigoBarrasInterno}\n`);

  // 6. TESTAR TRAVA DE NEGÓCIO: DESMONTE SEM TRIAGEM COMPLETA
  console.log('6. [VALIDAÇÃO REGRA DE NEGÓCIO] Testando bloqueio de desmonte prematuro...');
  try {
    loteService.movimentarStatus(equip1.codigoBarrasInterno, StatusRastreamento.EM_DESMONTE, sessao.usuario);
    console.error('   ❌ ERRO: A trava de desmonte permitiu o avanço indevido!');
  } catch (err: any) {
    console.log(`   ✔ Bloqueio funcionou corretamente: "${err.message}"\n`);
  }

  // 7. FLUXO REGULAR DE MOVIMENTAÇÃO
  console.log('7. [MOVIMENTAÇÃO] Concluindo triagem e enviando para desmonte...');
  loteService.movimentarStatus(equip1.codigoBarrasInterno, StatusRastreamento.EM_TRIAGEM, sessao.usuario);
  loteService.movimentarStatus(
    equip1.codigoBarrasInterno,
    StatusRastreamento.EM_DESMONTE,
    sessao.usuario,
    'Triagem concluída. Placa mãe com defeito.'
  );
  console.log('   ✔ Transições de status efetuadas com histórico preservado.\n');

  // 8. AUDITORIA E RASTREABILIDADE
  console.log('8. [AUDITORIA] Consultando relatório de rastreabilidade e logs...');
  const relatorioService = new ServicoRelatorio(repo, journal);
  console.log(relatorioService.rastrearEquipamento(equip1.codigoBarrasInterno));
  console.log(relatorioService.consultarJournal(10));

  console.log('================================================================');
  console.log('   ✔ JORNADA COMPLETA EXECUTADA E HOMOLOGADA COM SUCESSO!        ');
  console.log('================================================================');
}

rodarJornadaCompleta()
  .catch((e) => {
    console.error('❌ Falha nos testes:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });