import * as readline from 'readline';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao.js';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao.js';
import { ServicoLoteEquipamento } from '../services/ServicoLoteEquipamento.js';
import { ServicoUsuario } from '../services/ServicoUsuario.js';
import { ServicoRelatorio } from '../services/ServicoRelatorio.js';
import { CommandParser } from './CommandParser.js';
import { PapelUsuario, TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums.js';
import { Sessao } from '../domain/Entities.js';

function validarEnum<T extends string>(valores: readonly T[], entrada: string, campo: string): T {
  if (!valores.includes(entrada as T)) {
    throw new Error(`${campo} inválido: "${entrada}".`);
  }
  return entrada as T;
}

function converterData(entrada: string, campo: string): Date {
  const data = new Date(entrada);
  if (!Number.isFinite(data.getTime())) {
    throw new Error(`${campo} inválida.`);
  }
  return data;
}

export class CLIInterface {
  private autenticacao: ServicoAutenticacao;
  private organizacao: ServicoOrganizacao;
  private loteEquipamento: ServicoLoteEquipamento;
  private usuario: ServicoUsuario;
  private relatorio: ServicoRelatorio;
  private sessaoAtual: Sessao | null = null;
  private rl: readline.Interface;

  constructor(
    autenticacao: ServicoAutenticacao,
    organizacao: ServicoOrganizacao,
    loteEquipamento: ServicoLoteEquipamento,
    usuario: ServicoUsuario,
    relatorio: ServicoRelatorio
  ) {
    this.autenticacao = autenticacao;
    this.organizacao = organizacao;
    this.loteEquipamento = loteEquipamento;
    this.usuario = usuario;
    this.relatorio = relatorio;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private question(query: string): Promise<string> {
    return new Promise((resolve) => this.rl.question(query, resolve));
  }

  public async iniciarLoop(): Promise<void> {
    // 1. Processo de Autenticação
    console.log('--- AUTENTICAÇÃO ---');
    const user = await this.question('Usuário: ');
    const pass = await this.question('Senha: ');

    this.sessaoAtual = this.autenticacao.login(user, pass);


    if (!this.sessaoAtual) {
      console.log('❌ Credenciais inválidas. Encerrando...');
      this.rl.close();
      return;
    }

    console.log(`\n✔ Autenticado como: ${this.sessaoAtual.usuario} [${this.sessaoAtual.papel}]`);
    console.log(`Digite 'ajuda' para listar os comandos ou 'sair' para encerrar.\n`);

    // 2. Loop de Processamento do Terminal
    let rodando = true;
    while (rodando) {
      const entrada = await this.question(`${this.sessaoAtual.usuario}@greencode:~$ `);
      if (!this.autenticacao.isSessaoValida(this.sessaoAtual)) {
        console.log('\n❌ Sessão expirada por inatividade (30 minutos).');
        break;
      }
      if (!entrada.trim()) continue;

      if (entrada.trim().toLowerCase() === 'sair') {
        rodando = false;
        this.autenticacao.logout(this.sessaoAtual);
        console.log('Sessão encerrada.');
        break;
      }

      await this.processarComando(entrada);
    }

    this.rl.close();
  }

  public async processarComando(entrada: string): Promise<void> {
    if (!this.sessaoAtual) return;
    if (!this.autenticacao.isSessaoValida(this.sessaoAtual)) {
      console.log('\n❌ Sessão expirada por inatividade (30 minutos).');
      return;
    }
    this.autenticacao.registrarAtividade(this.sessaoAtual);

    const cmd = CommandParser.parse(entrada);

    try {
      switch (cmd.acaoPrincipal) {
        case 'ajuda':
          this.exibirMenuPorPapel(this.sessaoAtual.papel);
          break;

        // --- GESTÃO DE USUÁRIOS ---
        case 'usuario':
          if (this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR) {
            console.log('❌ Permissão negada.');
            break;
          }

          if (cmd.subAcao === 'criar') {
            const u = cmd.flags.nome || (await this.question('Usuário: '));
            const p = cmd.flags.senha || (await this.question('Senha: '));
            const papelInput = cmd.flags.papel || (await this.question('Papel (ADMINISTRADOR, OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO, AUDITOR): '));
            const papel = validarEnum(Object.values(PapelUsuario), papelInput, 'Papel');

            this.usuario.criarUsuario({
              usuario: u,
              senhaPlana: p,
              papel,
              usuarioResponsavel: this.sessaoAtual.usuario,
            });
            console.log(`✔ Usuário ${u} criado.`);
          } else if (cmd.subAcao === 'listar') {
            console.table(this.usuario.listarUsuarios());
          } else if (cmd.subAcao === 'editar') {
            const u = cmd.flags.user || (await this.question('Usuário a editar: '));
            const novoPapel = cmd.flags.papel || (await this.question('Novo Papel: '));
            this.usuario.editarUsuario(
              u,
              validarEnum(Object.values(PapelUsuario), novoPapel, 'Papel'),
              this.sessaoAtual.usuario
            );
            console.log(`✔ Usuário ${u} atualizado com sucesso.`);
          } else if (cmd.subAcao === 'remover') {
            const u = cmd.flags.user || (await this.question('Usuário a remover: '));
            this.usuario.removerUsuario(u, this.sessaoAtual.usuario);
            console.log(`✔ Usuário ${u} removido.`);
          }
          break;

        case 'senha': {
          const novaSenha = cmd.flags.nova || (await this.question('Nova senha: '));
          this.usuario.editarUsuario({
            usuario: this.sessaoAtual.usuario,
            novaSenhaPlana: novaSenha,
            usuarioResponsavel: this.sessaoAtual.usuario,
          });
          console.log('✔ Senha atualizada.');
          break;
        }

        // --- GESTÃO DE ORGANIZAÇÕES ---
        case 'org':
          if (
            this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR &&
            this.sessaoAtual.papel !== PapelUsuario.OPERADOR_CADASTRO
          ) {
            console.log('❌ Permissão negada.');
            break;
          }

          if (cmd.subAcao === 'criar') {
            const id = cmd.flags.id || (await this.question('ID: '));
            const razao = cmd.flags.razao || (await this.question('Razão Social: '));
            const cnpj = cmd.flags.cnpj || (await this.question('CNPJ: '));
            const end = cmd.flags.end || (await this.question('Endereço: '));
            const tel = cmd.flags.tel || (await this.question('Telefone: '));
            const email = cmd.flags.email || (await this.question('Email: '));

            this.organizacao.cadastrarOrganizacao({
              id,
              razaoSocial: razao,
              cnpj,
              enderecoCompleto: end,
              telefone: tel,
              email,
              usuarioResponsavel: this.sessaoAtual.usuario,
            });
            console.log('✔ Organização cadastrada com sucesso.');
          } else if (cmd.subAcao === 'listar') {
            console.table(this.organizacao.listarOrganizacoesAtivas());
          } else if (cmd.subAcao === 'editar') {
            const id = cmd.flags.id || (await this.question('ID da Organização: '));
            const end = cmd.flags.end || (await this.question('Novo Endereço: '));
            this.organizacao.alterarEndereco(id, end, this.sessaoAtual.usuario);
            console.log(`✔ Endereço da organização ${id} atualizado.`);
          }
          break;

        // --- GESTÃO DE CONTRATOS ---
        case 'contrato':
          if (
            this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR &&
            this.sessaoAtual.papel !== PapelUsuario.OPERADOR_CADASTRO
          ) {
            console.log('❌ Permissão negada.');
            break;
          }

          if (cmd.subAcao === 'criar') {
            const id = cmd.flags.id || (await this.question('ID Contrato: '));
            const org = cmd.flags.org || (await this.question('ID Organização: '));
            const venc = cmd.flags.vencimento || (await this.question('Data Vencimento (AAAA-MM-DD): '));
            const valor = cmd.flags.valor || (await this.question('Valor Mensal: '));

            this.organizacao.cadastrarContrato({
              id,
              organizacaoId: org,
              dataVencimento: converterData(venc, 'Data de vencimento'),
              valorMensal: Number(valor.replace(',', '.')),
              usuarioResponsavel: this.sessaoAtual.usuario,
            });
            console.log('✔ Contrato cadastrado.');
          } else if (cmd.subAcao === 'renovar') {
            const id = cmd.flags.id || (await this.question('ID Contrato: '));
            const novoVenc = cmd.flags.vencimento || (await this.question('Novo Vencimento (AAAA-MM-DD): '));
            this.organizacao.renovarContrato(
              id,
              converterData(novoVenc, 'Nova data de vencimento'),
              this.sessaoAtual.usuario
            );
            console.log(`✔ Contrato ${id} renovado com sucesso.`);
          } else if (cmd.subAcao === 'listar') {
            console.table(this.organizacao.listarContratos());
          }
          break;

        // --- GESTÃO DE LOTES ---
        case 'lote':
          if (
            this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR &&
            this.sessaoAtual.papel !== PapelUsuario.GESTOR_ALMOXARIFADO
          ) {
            console.log('❌ Permissão negada.');
            break;
          }

          if (cmd.subAcao === 'criar') {
            const id = cmd.flags.id || (await this.question('ID Lote: '));
            const org = cmd.flags.org || (await this.question('ID Org: '));
            const nf = cmd.flags.nf || (await this.question('Nota Fiscal: '));
            const transp = cmd.flags.transp || (await this.question('Transportadora: '));

            this.loteEquipamento.criarLote({
              id,
              organizacaoId: org,
              notaFiscal: nf,
              transportadora: transp,
              dataEntrada: new Date(),
              usuarioResponsavel: this.sessaoAtual.usuario,
            });
            console.log('✔ Lote cadastrado.');
          } else if (cmd.subAcao === 'consultar') {
            const inicio = cmd.flags.inicio ? converterData(cmd.flags.inicio, 'Data inicial') : new Date(0);
            const fim = cmd.flags.fim ? converterData(cmd.flags.fim, 'Data final') : new Date();
            if (inicio > fim) throw new Error('A data inicial não pode ser posterior à data final.');
            console.table(this.loteEquipamento.consultarLotesPorPeriodo(inicio, fim));
          }
          break;

        // --- GESTÃO DE EQUIPAMENTOS ---
        case 'equipamento':
          if (
            this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR &&
            this.sessaoAtual.papel !== PapelUsuario.GESTOR_ALMOXARIFADO
          ) {
            console.log('❌ Permissão negada.');
            break;
          }

          if (cmd.subAcao === 'adicionar') {
            const loteId = cmd.flags.lote || (await this.question('ID Lote: '));
            const tipoStr = cmd.flags.tipo || (await this.question('Tipo (ex: COMPUTADOR_MESA, NOTEBOOK, MONITOR, IMPRESSORA): '));
            const marca = cmd.flags.marca || (await this.question('Marca: '));
            const modelo = cmd.flags.modelo || (await this.question('Modelo: '));
            const anoStr = cmd.flags.ano || (await this.question('Ano Fabricação: '));
            const estadoStr = cmd.flags.estado || (await this.question('Estado Físico (NOVO, BOM_ESTADO, USADO_LEVE, USADO_MODERADO, DANIFICADO_LEVE, DANIFICADO_GRAVE, INSERVIVEL): '));
            const pesoStr = cmd.flags.peso || (await this.question('Peso (kg): '));

            const eq = this.loteEquipamento.adicionarEquipamento(
              loteId,
              {
                tipo: validarEnum(Object.values(TipoEquipamento), tipoStr, 'Tipo de equipamento'),
                marca,
                modelo,
                anoFabricacao: Number(anoStr),
                estadoFisico: validarEnum(Object.values(EstadoFisico), estadoStr, 'Estado físico'),
                pesoQuilogramas: Number(pesoStr.replace(',', '.')),
              },
              this.sessaoAtual.usuario
            );
            console.log(`✔ Equipamento adicionado! Código: ${eq.codigoBarrasInterno}`);
          } else if (cmd.subAcao === 'movimentar') {
            const id = cmd.flags.id || (await this.question('Código/ID Equipamento: '));
            const novoStatus = cmd.flags.status || (await this.question('Novo Status (ex: EM_TRIAGEM, AGUARDANDO_DESMONTE, EM_DESMONTE): '));
            const obs = cmd.flags.obs || (await this.question('Justificativa/Observação: '));

            this.loteEquipamento.movimentarEquipamento(
              id,
              validarEnum(Object.values(StatusRastreamento), novoStatus, 'Status de rastreamento'),
              obs,
              this.sessaoAtual.usuario
            );
            console.log(`✔ Movimentação do equipamento ${id} registrada.`);
          } else if (cmd.subAcao === 'estado') {
            const id = cmd.flags.id || (await this.question('Código/ID Equipamento: '));
            const novoEstado = cmd.flags.estado || (await this.question('Novo estado físico: '));
            const justificativa = cmd.flags.obs || (await this.question('Justificativa: '));
            this.loteEquipamento.alterarEstadoFisicoEquipamento(
              id,
              validarEnum(Object.values(EstadoFisico), novoEstado, 'Estado físico'),
              justificativa,
              this.sessaoAtual.usuario
            );
            console.log(`✔ Estado físico do equipamento ${id} atualizado.`);
          } else if (cmd.subAcao === 'listar') {
            const loteId = cmd.flags.lote || (await this.question('ID Lote: '));
            console.table(this.loteEquipamento.listarEquipamentosPorLote(loteId));
          }
          break;

        case 'rastrear':
          const idBusca = cmd.posicionais[0] || (await this.question('Código/ID Equipamento: '));
          console.log(this.relatorio.rastrearEquipamento(idBusca));
          break;

        case 'journal':
          if (
            this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR &&
            this.sessaoAtual.papel !== PapelUsuario.AUDITOR
          ) {
            console.log('❌ Permissão negada.');
            break;
          }
          console.log(this.relatorio.consultarJournal(15));
          break;

        default:
          console.log(`Comando desconhecido: "${cmd.acaoPrincipal}". Digite 'ajuda'.`);
      }
    } catch (e: any) {
      console.log(`\n❌ ERRO: ${e.message}\n`);
    }
  }

  public exibirMenuPorPapel(papel: PapelUsuario): void {
    console.log(`\n--- COMANDOS DISPONÍVEIS [${papel}] ---`);
    console.log('  rastrear <codigo_barras>                           - Rastreia a jornada do equipamento');
    console.log('  senha [--nova <SENHA>]                             - Altera sua própria senha');

    if (papel === PapelUsuario.ADMINISTRADOR) {
      console.log('  usuario criar --nome <NOME> --senha <S> --papel <P> - Cadastra conta de acesso');
      console.log('  usuario listar                                     - Lista usuários cadastrados');
      console.log('  usuario editar --user <U> --papel <P>              - Altera o papel do usuário');
      console.log('  usuario remover --user <U>                         - Remove um usuário');
    }

    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.OPERADOR_CADASTRO) {
      console.log('  org criar --id <ID> --cnpj <CNPJ>                   - Cadastra empresa parceira');
      console.log('  org listar                                         - Lista empresas cadastradas');
      console.log('  org editar --id <ID> --end <ENDEREÇO>              - Atualiza endereço da empresa');
      console.log('  contrato criar --id <ID> --org <ORG> --valor <V>   - Cadastra novo contrato');
      console.log('  contrato renovar --id <ID> --vencimento <DATA>     - Renova contrato existente');
      console.log('  contrato listar                                     - Lista contratos cadastrados');
    }

    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.GESTOR_ALMOXARIFADO) {
      console.log('  lote criar --id <ID> --org <ORG>                   - Registra entrada de lote');
      console.log('  lote consultar [--inicio DATA] [--fim DATA]        - Consulta lotes por período');
      console.log('  equipamento adicionar --lote <ID> --tipo <TIPO>... - Cadastra equipamento no lote');
      console.log('  equipamento movimentar --id <ID> --status <STATUS> - Altera status e movimentação');
      console.log('  equipamento estado --id <ID> --estado <ESTADO>     - Atualiza condição física');
      console.log('  equipamento listar --lote <ID>                     - Lista equipamentos de um lote');
    }

    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.AUDITOR) {
      console.log('  journal                                            - Consulta os logs imutáveis');
    }

    console.log('  sair                                               - Encerra a aplicação\n');
  }
}