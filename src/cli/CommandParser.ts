export interface ComandoParseado {
  acaoPrincipal: string;
  subAcao: string;
  posicionais: string[];
  flags: Record<string, string>;
}

export class CommandParser {
  public static parse(linhaEntrada: string): ComandoParseado {
    const entradaLimpa = linhaEntrada.trim();
    if (!entradaLimpa) {
      return { acaoPrincipal: '', subAcao: '', posicionais: [], flags: {} };
    }

    // Regex para extrair tokens respeitando textos entre aspas (ex: --obs "Aguardando triagem")
    const regexTokens = /[^\s"]+|"[^"]*"/g;
    const tokensBrutos = entradaLimpa.match(regexTokens) || [];

    // Remove as aspas delimitadoras dos tokens extraídos
    const tokens = tokensBrutos.map((t) => t.replace(/^"|"$/g, ''));

    const acaoPrincipal = tokens[0] ? tokens[0].toLowerCase() : '';
    const subAcao = tokens[1] && !tokens[1].startsWith('--') ? tokens[1].toLowerCase() : '';

    const inicioArgs = subAcao ? 2 : (tokens[0] && !tokens[0].startsWith('--') ? 1 : 0);
    const posicionais: string[] = [];
    const flags: Record<string, string> = {};

    for (let i = inicioArgs; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.startsWith('--')) {
        const chave = token.substring(2);
        const proximoToken = tokens[i + 1];

        if (proximoToken && !proximoToken.startsWith('--')) {
          flags[chave] = proximoToken;
          i++; // Avança o índice pois consumiu o valor da flag
        } else {
          flags[chave] = 'true';
        }
      } else {
        posicionais.push(token);
      }
    }

    return { acaoPrincipal, subAcao, posicionais, flags };
  }
}