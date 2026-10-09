# Bingo da Quermesse — cartelas para imprimir e cantador de pedras (HTML + CSS + JS)

Tudo o que um bingo de quermesse, festa junina, escola ou família precisa, numa página só: gerar e imprimir as cartelas, cantar as pedras com painel e voz, e conferir na hora se a cartela de quem gritou "bingo!" está certa.

**Acesse online:** https://micdog22.github.io/bingo-quermesse/

## Recursos

- Bingo de **75 pedras**: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75.
- Cartelas 5×5 com **centro livre** opcional, título e uma linha de informações (data, local).
- **1, 2 ou 4 cartelas por folha A4**, com número da cartela e código impressos. Duas por folha sai com a folha deitada, para as cartelas ficarem maiores.
- Cada cartela é sempre a mesma para o mesmo **código + número**: dá para conferir qualquer cartela depois, mesmo sem guardar as folhas. Num mesmo código, todas as cartelas são diferentes.
- Numeração a partir de qualquer número, para imprimir em lotes (ex.: cartelas 101 a 200).
- **Cantador**: sorteia a próxima pedra sem repetir, mostra a última bem grande com a letra, marca o painel de 1 a 75 e guarda o histórico. Dá para desfazer a última.
- **Voz em português** opcional ("B... 5"), usando a síntese de voz do navegador.
- **Conferir cartela**: pelo número e código, mostra a cartela com as pedras já cantadas e diz se fechou o padrão escolhido: linha (horizontal, vertical ou diagonal), quatro cantos ou cartela cheia.
- O jogo em andamento fica salvo no navegador: recarregar a página não perde as pedras.

## Como usar

1. Na aba **Cartelas**, preencha o título, a quantidade e quantas cartelas por folha. O código é gerado sozinho (dá para trocar ou digitar um seu). **Anote o código.**
2. Clique em **Imprimir**. Na janela de impressão, deixe papel A4 e escala 100%; a própria folha já tem margem de 1 cm.
3. Na hora do jogo, use a aba **Cantar pedras**.
4. Quando alguém gritar bingo, abra **Conferir cartela**, digite o número da cartela, escolha o padrão e clique em **Conferir**.

## Como funciona

- **Cartelas determinísticas.** A cartela N é gerada a partir do texto `bingo-quermesse|v1|CÓDIGO|N|tentativa`, que passa pelo hash cyrb128 e alimenta o gerador sfc32. Em cada coluna são escolhidos 5 números da faixa da letra (4 na coluna N com centro livre), em ordem crescente. O código é normalizado: espaços somem e as letras viram maiúsculas.
- **Sem cartelas repetidas.** As cartelas são geradas em ordem (1, 2, 3…). Se alguma sair igual a uma anterior, o que é praticamente impossível, ela é refeita com a tentativa seguinte. Por isso a cartela 500 é sempre a mesma, imprimindo de 1 a 500 ou só de 500 a 500.
- **Sorteio das pedras** com `crypto.getRandomValues`, sem viés, entre as pedras que ainda estão no globo.
- **Padrões**: linha vale para qualquer uma das 5 linhas, 5 colunas e 2 diagonais; o centro livre conta como marcado.
- O código das cartelas não é uma senha: ele só serve para refazer e conferir cartelas. A justiça do jogo está no sorteio das pedras.

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com um servidor estático:

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`, com Node 20 ou mais novo). Os testes cobrem a validade das cartelas (faixas das colunas, sem repetição, centro livre), o determinismo por código e número, 500 cartelas diferentes, os padrões com e sem centro livre e o cantador tirando as 75 pedras sem repetir.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT — veja [LICENSE](LICENSE).
