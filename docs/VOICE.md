# Voz e personalidade

## Agente de conversa: OpenRouter (desde 26/10/2026)

O agente agora é `conversation.anthropic_claude_haiku_5_5`, pela integração OpenRouter, com o mesmo prompt (`ha-package/prompt-pt-BR.txt`) e só a API "Assist". O pipeline `Pet`, o cartão (`agent_id`) e a tarefa de IA padrão (usada pelos lembretes) apontam para ele. Motivo da troca: o nível gratuito do Gemini passou a responder 503 "high demand". Teste por texto: previsão com o script do pet, piada inocente e recusa honesta de lembrete com hora marcada, em 2 a 4 s cada. O texto abaixo descreve a configuração anterior, com o Gemini.

## Configuração anterior: Gemini

O pet usa o Gemini como agente de conversa no pipeline `Pet`. Comandos simples ("acende a luz da sala") continuam sendo resolvidos localmente pelo HA, sem passar pelo Gemini ("preferir comandos locais"). O Gemini entra nas perguntas livres e dá a personalidade.

### 1. Chave de API (o dono faz)
1. Acesse **aistudio.google.com** → **Get API key** → **Create API key**.
2. **Ative o faturamento** no projeto da chave (Google Cloud → Billing). A assinatura do app Gemini **não** inclui a API. No nível gratuito da API, o Google pode usar as conversas para treinar modelos; com faturamento ativo, não. O custo nesse volume costuma ser de centavos por mês.
3. Guarde a chave só no HA. Não a cole em chats, e-mails nem arquivos do projeto.

### 2. Integração no HA (o dono faz)
**Configurações → Dispositivos e serviços → Adicionar integração → Google Gemini** (o nome antigo era "Google Generative AI") e cole a chave.

### 3. Configuração do agente (pelo conector)
- Prompt: o conteúdo de `ha-package/prompt-pt-BR.txt` (personalidade, respostas curtas, sem emojis nem listas, uso de `pet_definir_emocao`).
- Controle do Home Assistant: **Assist**.
- Modelo: as configurações recomendadas da integração (um modelo "Flash", rápido).
- Pipeline `Pet`: agente de conversa = Gemini; "preferir comandos locais" continua ligado.
- Pergunta por texto do cartão: `agent_id` com a entidade do agente Gemini.

### O que o Gemini recebe
Só **texto**: a frase reconhecida e o estado das entidades **expostas ao Assist**. Áudio (reconhecimento e fala) fica com o HA Cloud; imagens de câmera não são enviadas. Por isso vale revisar o que está exposto (Configurações → Assistentes de voz → Expor).

## Expressão do rosto durante a conversa
A automação "Pet · emoção pela fala" (pacote HA) lê o texto da resposta no sensor de fala do satélite (`sensor.<satélite>_tts`, achado pelo rótulo `pet_satelite`) assim que o pet começa a falar, e escolhe a expressão por palavras-chave: desculpas → triste; "nossa", "uau" → surpreso; "parabéns", "pronto", "que bom" → feliz; pergunta → curioso; "deixe-me ver", "acho que" → pensando; o resto → neutro. Ela chama `script.pet_definir_emocao`, e "Pet · humor volta ao normal" devolve o rosto ao neutro depois de 1 minuto.

Antes, o próprio Gemini chamava o script como ferramenta. Cada ferramenta custa uma ida e volta inteira ao LLM (6 s numa conversa medida), então o script deixou de ser exposto ao Assist.

## Previsão do tempo
O Assist só entrega ao LLM o tempo **atual**. Sem outra fonte, o Gemini inventou "não vai chover amanhã" a partir do tempo de agora. O script `script.pet_previsao_do_tempo`, **exposto ao Assist**, devolve hoje e os próximos 3 dias (condição, máxima, mínima, chuva em mm) a partir de `weather.home`, e o prompt manda usá-lo.

## Tempo de resposta
Numa pergunta medida pela depuração do pipeline ("Vai chover amanhã?"), o Gemini levou 36 s em três chamadas: 27,8 s, 6,4 s e 1,7 s. A emoção por palavras-chave elimina uma chamada por conversa. Se a primeira chamada continuar lenta, os próximos passos são ajustar o "raciocínio" do modelo e, se preciso, testar com faturamento ativo. Para ver os tempos: Configurações → Assistentes de voz → Pet → ⋮ → Depurar.

## Opcional: voz 100% local (Whisper + Piper)
Hoje o reconhecimento e a fala usam o HA Cloud (melhor qualidade em pt-BR). Para testar tudo local, os apps **Whisper** e **Piper** já estão instalados:

- [ ] **Whisper** (Configurações → Apps → Whisper → Configuração): idioma `pt`; modelo `small-int8` (equilíbrio) ou `medium-int8` (melhor, mais lento no processador). Reinicie o app.
- [ ] **Piper**: voz pt-BR, por exemplo `pt_BR-faber-medium`. Reinicie o app.
- [ ] Confira as integrações **Wyoming** (Whisper e Piper) carregadas em Dispositivos e serviços.
- [ ] Crie o pipeline **"Pet (local)"**: STT `faster-whisper`, TTS `piper`, mesmo agente do pipeline `Pet`.
- [ ] No tablet, troque o *Assistant* do VACA para "Pet (local)" e compare: tempo de resposta (alvo: menos de 2 s até começar a falar), acerto em frases da casa e naturalidade da voz.
- [ ] Se ficar pior, volte o *Assistant* para "Pet". Nada mais muda.

## Frases locais do pet (sem LLM)
Respondem na hora, porque o pipeline prefere comandos locais. Estão no pacote, em gatilhos `conversation`.

| Frase | O que faz |
|---|---|
| "Modo foco 25 minutos" / "modo foco" | Pet quieto até o tempo acabar (padrão `pet_foco_minutos`) |
| "Parar modo foco" | Encerra o foco |
| "Me lembre de desligar o arroz daqui a 15 minutos" | Lembrete com alarme e frase escrita pela IA na hora do pedido |
| "Me lembre de … em 2 horas" / "daqui a meia hora" / "hora e meia" | Outras formas de tempo |
| "Cancelar lembretes" | Apaga os três lembretes |
