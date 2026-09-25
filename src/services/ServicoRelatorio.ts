// src/services/ServicoRelatorio.ts
import * as fs from 'fs';
import * as path from 'path';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { Lote, Organizacao, Equipamento } from '../domain/Entities';
import { StatusRastreamento } from '../domain/Enums';

export class ServicoRelatorio {
  private repo: RepositorioArquivo;
  private diretorioBase: string;

  constructor(repo: RepositorioArquivo, diretorioBase: string = './data') {
    this.repo = repo;
    this.diretorioBase = diretorioBase;
  }

  /**
   * Rastreia toda a jornada de um equipamento pelo código de barras ou ID
   */
  public rastrearEquipamento(identificador: string): string {
    const lotes = this.repo.carregarEntidade<Lote[]>('lotes') || [];
    let equipEncontrado: Equipamento | null = null;
    let loteOrigem: Lote | null = null;

    for (const l of lotes) {
      const eq = l.equipamentos.find(
        (e) => e.codigoBarrasInterno === identificador || e.id === identificador
      );
      if (eq) {
        equipEncontrado = eq;
        loteOrigem = l;
        break;
      }
    }

    if (!equipEncontrado || !loteOrigem) {
      return `❌ Equipamento com código/ID "${identificador}" não foi encontrado.`;
    }

    const orgs = this.repo.carregarEntidade<Organizacao[]>('organizacoes') || [];
    const org = orgs.find((o) => o.id === loteOrigem!.organizacaoId);

    let output = `\n======================================================\n`;
    output += `       RELATÓRIO DE RASTREABILIDADE DE EQUIPAMENTO    \n`;
    output += `======================================================\n`;
    output += `Código de Barras: ${equipEncontrado.codigoBarrasInterno}\n`;
    output += `Tipo:               ${equipEncontrado.tipo}\n`;
    output += `Marca / Modelo:     ${equipEncontrado.marca} / ${equipEncontrado.modelo}\n`;
    output += `Estado Físico:      ${equipEncontrado.estadoFisico}\n`;
    output += `Status Atual:       ${equipEncontrado.statusRastreamento}\n`;
    output += `------------------------------------------------------\n`;
    output += `Lote de Origem:     ${loteOrigem.id} (NF: ${loteOrigem.notaFiscal})\n`;
    output += `Organização:        ${org ? org.razaoSocial : loteOrigem.organizacaoId} (CNPJ: ${org?.cnpj || 'N/A'})\n`;
    output += `Data de Entrada:    ${new Date(loteOrigem.dataEntrada).toLocaleString()}\n`;
    output += `------------------------------------------------------\n`;
    output += `HISTÓRICO DE MOVIMENTAÇÕES:\n`;

    if (equipEncontrado.historicoMovimentacao.length === 0) {
      output += ` (Nenhuma movimentação registrada até o momento)\n`;
    } else {
      equipEncontrado.historicoMovimentacao.forEach((m, i) => {
        output += ` ${i + 1}. [${new Date(m.dataHora).toLocaleString()}] De: ${m.origem} -> Para: ${m.destino}\n`;
        output += `    Responsável: ${m.responsavel}\n`;
        if (m.observacao) output += `    Justificativa/Obs: ${m.observacao}\n`;
      });
    }
    output += `======================================================\n`;

    return output;
  }

  /**
   * Consulta os logs de Journal imutáveis
   */
  public consultarJournal(limite: number = 20): string {
    const caminhoJournal = path.join(this.diretorioBase, 'journal.log');

    if (!fs.existsSync(caminhoJournal)) {
      return 'Nenhum registro de journal encontrado.';
    }

    const linhas = fs.readFileSync(caminhoJournal, 'utf8').trim().split('\n');
    const ultimasLinhas = linhas.slice(-limite);

    let output = `\n=== ÚLTIMAS ${ultimasLinhas.length} TRANSAÇÕES REGISTRADAS (JOURNAL) ===\n`;
    ultimasLinhas.forEach((linha) => {
      try {
        const item = JSON.parse(linha);
        output += `[${new Date(item.timestamp).toLocaleString()}] OP: ${item.operacao} | Entidade: ${item.entidade} | Resp: ${item.usuarioResponsavel}\n`;
      } catch {
        output += `${linha}\n`;
      }
    });

    return output;
  }
}