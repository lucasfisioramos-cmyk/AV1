import { PapelUsuario, StatusLote, TipoEquipamento, EstadoFisico, StatusRastreamento } from './Enums';

export interface Credencial {
  usuario: string;
  hashSenha: string;
  salt: string;
  ultimoAcesso?: string;
  papel: PapelUsuario;
}

export interface Sessao {
  token: string;
  usuario: string;
  papel: PapelUsuario;
  criacao: string;
  expiracao: string;
}

export interface Contrato {
  id: string;
  organizacaoId: string;
  dataAssinatura: string;
  dataVencimento: string;
  clausulas: string[];
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

export interface Organizacao {
  id: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
  dataCadastro: string;
  ativo: boolean;
  contratoVigente?: Contrato;
}

export interface Movimentacao {
  id: string;
  equipamentoId: string;
  dataHora: string;
  origem: string;
  destino: string;
  responsavel: string;
  observacao?: string;
}

export interface Equipamento {
  id: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  loteId: string;
  posicaoNoLote: number;
  statusRastreamento: StatusRastreamento;
  historicoMovimentacao: Movimentacao[];
}

export interface Lote {
  id: string;
  dataEntrada: string;
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  statusProcessamento: StatusLote;
  observacoes?: string;
  equipamentos: Equipamento[];
}

export interface ConfiguracaoMestre {
  chaveMestra: string;
  criadoEm: string;
}