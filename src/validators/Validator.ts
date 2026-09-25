export abstract class Validator<T> {
  protected mensagemErro: string = '';

  public abstract validar(objeto: T): boolean;

  public obterMensagemErro(): string {
    return this.mensagemErro;
  }
}

export class ValidadorCNPJ extends Validator<string> {
  public validar(cnpj: string): boolean {
    const limpo = cnpj.replace(/\D/g, '');

    if (limpo.length !== 14) {
      this.mensagemErro = 'CNPJ deve conter 14 dígitos numericos.';
      return false;
    }

    if (/^(\d)\1+$/.test(limpo)) {
      this.mensagemErro = 'CNPJ invalido (sequência repetida).';
      return false;
    }

    // Algoritmo de cálculo de dígitos verificadores
    let tamanho = limpo.length - 2;
    let numeros = limpo.substring(0, tamanho);
    const digitos = limpo.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0), 10)) {
      this.mensagemErro = 'Dígito verificador do CNPJ é inválido.';
      return false;
    }

    tamanho = tamanho + 1;
    numeros = limpo.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1), 10)) {
      this.mensagemErro = 'Dígito verificador do CNPJ é inválido.';
      return false;
    }

    return true;
  }
}

export class ValidadorDataEntrada extends Validator<Date> {
  public validar(data: Date): boolean {
    const agora = new Date();
    const limitePassado = new Date();
    limitePassado.setDate(agora.getDate() - 90); // Máximo 90 dias atrás

    if (data > agora) {
      this.mensagemErro = 'A data de entrada não pode ser futura.';
      return false;
    }

    if (data < limitePassado) {
      this.mensagemErro = 'A data de entrada não pode ser anterior a 90 dias.';
      return false;
    }

    return true;
  }
}