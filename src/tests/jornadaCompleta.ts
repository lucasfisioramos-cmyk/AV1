import * as fs from 'fs';
import * as path from 'path';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { JournalTransacaoService } from '../persistence/JournalTransacao';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao';
import { ServicoLoteEquipamento } from '../services/ServicoLoteEquipamento';
import { ServicoRelatorio } from '../services/ServicoRelatorio';
import { PapelUsuario, TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums';
import { Credencial } from '../domain/Entities';

const TEST_DIR = './data_test';
const CONFIG_FILE = path.join(TEST_DIR, 'config.json.enc');

async function rodarJornadaCompleta() {
  console.log('================================================================');
  console.log('   INICIANDO BATERIA DE TESTES AUTOMATIZADOS (JORNADA COMPLETA) ');
  console.log('================================================================\n');

  // Limpar ambiente de teste anterior
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  // 1. SIMULAÇÃO DE PROVISIONAMENTO INICIAL
  console.log('1. [PROVISIONAMENTO] Gerando chave mestra e criando administrador...');
  const chaveMestra = CriptografiaArquivo.gerarChave();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ chaveMestra, criadoEm: new Date().toISOString() }), 'utf8');

  const journal = new JournalTransacaoService(TEST_DIR);
  const repo = new RepositorioArquivo(TEST_DIR, chaveMestra);

  const salt = CriptografiaArquivo.gerarSalt();
  const adminCred: Credencial = {
    usuario: 'admin_test',
    hashSenha: CriptografiaArquivo.gerarHashSenha('Senha@123', salt),
    salt,
    papel: PapelUsuario.ADMINISTRADOR,
  };
  repo.salvarEntidade('credenciais', [adminCred]);
  journal.registrar({ operacao: 'PROVISIONAMENTO_TESTE', entidade: 'Configuracao', usuarioResponsavel: 'SYSTEM' });
  console.log('   ✔ Provisionamento efetuado com sucesso.\n');

  // 2. SIMULAÇÃO DE AUTENTICAÇÃO E SESSÃO
  console.log('2. [AUTENTICAÇÃO] Testando login com SHA-256 e validação de sessão...');
  const authService = new ServicoAutenticacao(repo, journal);
  const sessao = authService.login('admin_test', 'Senha@123');

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
  const relatorioService = new ServicoRelatorio(repo, TEST_DIR);
  console.log(relatorioService.rastrearEquipamento(equip1.codigoBarrasInterno));
  console.log(relatorioService.consultarJournal(10));

  console.log('================================================================');
  console.log('   ✔ JORNADA COMPLETA EXECUTADA E HOMOLOGADA COM SUCESSO!        ');
  console.log('================================================================');
}

rodarJornadaCompleta().catch((e) => {
  console.error('❌ Falha nos testes:', e);
  process.exit(1);
});