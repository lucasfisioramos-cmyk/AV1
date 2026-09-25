import * as readline from 'readline';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao';
import { ServicoLoteEquipamento } from '../services/ServicoLoteEquipamento';
import { ServicoUsuario } from '../services/ServicoUsuario';
import { ServicoRelatorio } from '../services/ServicoRelatorio';
import { CommandParser } from './CommandParser';
import { PapelUsuario, TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums';
import { Sessao } from '../domain/Entities';

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
      if (!this.autenticacao.isSessaoValida(this.sessaoAtual)) {
        console.log('\n❌ Sessão expirada por inatividade (30 minutos).');
        break;
      }

      const entrada = await this.question(`${this.sessaoAtual.usuario}@greencode:~$ `);
      if (!entrada.trim()) continue;

      if (entrada.trim().toLowerCase() === 'sair') {
        rodando = false;
        console.log('Sessão encerrada.');
        break;
      }

      await this.processarComando(entrada);
    }

    this.rl.close();
  }

  public async processarComando(entrada: string): Promise<void> {
    if (!this.sessaoAtual) return;

    const cmd = CommandParser.parse(entrada);

    try {
      switch (cmd.acaoPrincipal.toLowerCase()) {
        case 'ajuda':
          this.exibirMenuPorPapel(this.sessaoAtual.papel);
          break;

        case 'usuario':
          if (this.sessaoAtual.papel !== PapelUsuario.ADMINISTRADOR) {
            console.log('❌ Permissão negada.');
            break;
          }
          if (cmd.subAcao === 'criar') {
            const u = cmd.flags.nome || (await this.question('Usuário: '));
            const p = cmd.flags.senha || (await this.question('Senha: '));
            this.usuario.criarUsuario({
              usuario: u,
              senhaPlana: p,
              papel: PapelUsuario.OPERADOR_CADASTRO,
              usuarioResponsavel: this.sessaoAtual.usuario,
            });
            console.log(`✔ Usuário ${u} criado.`);
          } else if (cmd.subAcao === 'listar') {
            console.table(this.usuario.listarUsuarios());
          }
          break;

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
          }
          break;

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
          }
          break;

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
            const marca = cmd.flags.marca || (await this.question('Marca: '));
            const modelo = cmd.flags.modelo || (await this.question('Modelo: '));

            const eq = this.loteEquipamento.adicionarEquipamento(
              loteId,
              {
                tipo: TipoEquipamento.NOTEBOOK,
                marca,
                modelo,
                anoFabricacao: 2023,
                estadoFisico: EstadoFisico.USADO_LEVE,
                pesoQuilogramas: 1.8,
              },
              this.sessaoAtual.usuario
            );
            console.log(`✔ Equipamento adicionado! Código: ${eq.codigoBarrasInterno}`);
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
    console.log('  rastrear <codigo_barras>          - Rastreia a jornada do equipamento');

    if (papel === PapelUsuario.ADMINISTRADOR) {
      console.log('  usuario criar                     - Cadastra conta de acesso');
      console.log('  usuario listar                    - Lista usuários cadastrados');
    }
    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.OPERADOR_CADASTRO) {
      console.log('  org criar --id <ID> --cnpj <CNPJ> - Cadastra empresa parceira');
    }
    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.GESTOR_ALMOXARIFADO) {
      console.log('  lote criar --id <ID> --org <ORG>  - Registra entrada de lote');
      console.log('  equipamento adicionar             - Cadastra equipamento no lote');
      console.log('  equipamento movimentar            - Altera status do equipamento');
    }
    if (papel === PapelUsuario.ADMINISTRADOR || papel === PapelUsuario.AUDITOR) {
      console.log('  journal                           - Consulta os logs imutáveis');
    }
    console.log('  sair                              - Encerra a aplicação\n');
  }
}