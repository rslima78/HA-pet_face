# Instalação

Duas partes: o **pacote do HA** (helpers e automações, a lógica do pet) e a **página** (só exibe). O pacote funciona sozinho, mesmo com a página fechada.

Pré-requisito: Home Assistant 2026.7 ou mais novo (testado no 2026.10). Para copiar arquivos, use o app **File editor**, o **Studio Code Server** ou o compartilhamento **Samba** (`\\IP-DO-HA\config`).

## 1. Pacote do HA

### 1.1 Ativar pacotes (só na primeira vez)
Abra `/config/configuration.yaml`. Se ainda não houver uma linha `packages:`, acrescente:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Se o arquivo já tiver uma seção `homeassistant:`, coloque só a linha `packages:` dentro dela. Não crie uma segunda seção `homeassistant:`. Antes de editar, guarde uma cópia do arquivo.

### 1.2 Copiar o pacote
Crie a pasta `/config/packages/` (se não existir) e copie `ha-package/pet.yaml` para `/config/packages/pet.yaml`.

### 1.3 Verificar e reiniciar
1. **Ferramentas → YAML → Verificar configuração**. Corrija qualquer erro antes de seguir.
2. **Configurações → Sistema → Reiniciar**. Ativar pacotes pela primeira vez exige reinício.

Em atualizações futuras do `pet.yaml` não é preciso reiniciar: em **Ferramentas → YAML**, use **Todas as configurações YAML** (ou recarregue "Automações", "Scripts" e os auxiliares afetados).

### 1.4 Gravar os valores padrão
Em **Configurações → Automações e cenas → Scripts**, rode **"Pet · aplicar valores padrão"** uma vez. Ele grava:

| Ajuste | Padrão |
|---|---|
| Pet · minutos sem movimento para dormir | 15 |
| Pet · intervalo mínimo entre saudações | 10 |
| Pet · início da noite | 22:00 |
| Pet · fim da noite | 07:00 |

Antes de rodar o script, início e fim da noite ficam em 00:00, e o HA considera um intervalo com início igual ao fim como o dia todo. Por isso, sem o script, as regras de dia e de noite se confundem.

Depois, ajuste esses valores quando quiser em **Configurações → Dispositivos e serviços → Auxiliares**, sem editar o YAML.

### 1.5 Marcar os sensores de presença
A automação de presença segue o rótulo **Pet presença** (id `pet_presenca`). Assim, para trocar ou acrescentar sensores, basta mudar o rótulo, sem mexer no YAML.

1. **Configurações → Áreas, rótulos e zonas → Rótulos → Criar rótulo**, com o nome `Pet presença`.
2. Aplique o rótulo nas entidades:
   - `binary_sensor.camera_da_sala_motion_alarm`
   - `binary_sensor.camera_da_sala_cell_motion_detection`
   - `binary_sensor.vaca_<id>_motion` (câmera do tablet; antes, ponha `select.vaca_<id>_motion_detection` em `face`)

Use só sensores do cômodo do tablet. A campainha fica de fora de propósito, porque detecta quem chega na porta, não quem está na sala.

### 1.6 Conferir
- Ande pela sala: `input_boolean.pet_presenca` liga, o pet acorda e o humor vai para "curioso" com uma saudação em `input_text.pet_message`.
- Saia: depois do tempo configurado, `pet_presenca` desliga e o pet dorme (`pet_sleep` ligado, humor "dormindo").
- O histórico das automações "Pet · …" (Configurações → Automações) mostra cada decisão.

### O que o pacote cria
| Entidade | Papel |
|---|---|
| `input_select.pet_mood` | humor exibido (contrato com a página) |
| `input_text.pet_message` | fala/legenda atual (contrato) |
| `input_boolean.pet_sleep` | modo dormir (contrato) |
| `input_button.pet_carinho` | a página aperta ao receber carinho (contrato) |
| `input_button.pet_ouvir` | a página aperta quando seguram o dedo no rosto; a automação `pet_ouvir` aperta o botão Wake do satélite (`button.<id>_wake`, achado pelo rótulo Pet satélite) |
| `input_boolean.pet_presenca` | alguém na sala, calculado pelos sensores do rótulo |
| `input_boolean.pet_falar_saudacao` | se a saudação também é falada pelo satélite (padrão: ligado) |
| `input_number.pet_ausencia_minutos`, `input_number.pet_saudacao_intervalo` | ajustes |
| `input_datetime.pet_noite_inicio`, `input_datetime.pet_noite_fim` | janela da noite |
| `input_datetime.pet_ultima_saudacao` | carimbo para o intervalo entre saudações |
| `timer.pet_ausencia` | contagem de ausência |
| `script.pet_aplicar_padroes` | grava os padrões |
| `script.pet_definir_emocao` | muda a expressão do rosto (usado pela automação "emoção pela fala"; não precisa ser exposto) |
| `script.pet_previsao_do_tempo` | previsão de hoje e dos próximos 3 dias para o LLM (**expor ao Assist**; usa `weather.home`) |
| `input_number.pet_brilho_dia`, `input_number.pet_brilho_dormindo` | brilho da tela do tablet acordado e dormindo |
| 8 automações `Pet · …` | presença, acordar e saudar, dormir, acordar pela voz, emoção pela fala, brilho da tela, humor volta ao normal, carinho |
| Automações da casa `Pet · …` | porta da entrada aberta (3 min), ventilador ligado de dia, luz acesa de dia (30 min), comida da Bela (13h e 21h) |
| Mais automações da casa | campainha, alguém a caminho (saiu do trabalho), bateria do tablet, aviso de chuva, "boa noite" (desliga tudo e confere a porta), Bela por voz (`input_datetime.pet_bela_comeu`) |
| `input_select.pet_clima`, `input_number.pet_calor_graus`, `input_number.pet_frio_graus` | clima de fora; alimenta o comentário do tempo |
| `input_datetime.pet_comentario_clima` | último comentário de calor ou frio (`pet_comentario_clima`: no máximo um de manhã e um à tarde) |
| `input_select.pet_acessorio`, `input_text.pet_faixa` | enfeites de datas especiais (festa, Natal, Halloween) e a faixa "Parabéns" |
| `script.pet_demo`, `script.pet_demo_encerrar`, `input_boolean.pet_demo` | demonstração por voz ("modo demo", "quem é você"; "parar demo" encerra) |
| `input_number.pet_rosto_intervalo` | intervalo mínimo (padrão 30 min) entre as conversas que o pet puxa ao ver um rosto pela câmera do tablet (`pet_rosto_conversa`) |

As automações vêm do arquivo, então a interface do HA as mostra somente leitura. Para mudar o comportamento, edite o `pet.yaml` e recarregue.

### Remover
Apague `/config/packages/pet.yaml` e reinicie. As entidades somem junto.

## 2. Página

1. Gere o build com `npm run build`, ou use a pasta `dist/` do repositório.
2. Copie **o conteúdo** de `dist/` para `/config/www/pet/`. Se a pasta `/config/www` não existia, reinicie o HA uma vez para ele passar a servir `/local/`.
3. Opcional: copie `pet.config.example.json` para `/config/www/pet/pet.config.json` e ajuste (atalhos; satélite a partir da Etapa 4).
4. Abra `http://IP-DO-HA:8123/local/pet/index.html` e use **"Entrar com o Home Assistant"**.

Tudo em `/local/` é público na rede local: qualquer um consegue abrir a página, mas sem login ela não lê nem controla nada. Nunca coloque tokens em `pet.config.json`.

### Atualizar a página
O HA serve `/local/` com **cache de 31 dias**, inclusive no app do tablet. Por isso, a cada atualização:
1. Em `/config/www/pet/`, apague `index.html` e `assets/` (**mantenha `pet.config.json`**) e copie o novo `dist/`.
2. Troque o número no endereço do painel "Pet", por exemplo `/local/pet/index.html?v=202610231548`, usando o número de versão do build (aparece no rodapé da tela de setup e no painel dev). Sem trocar o endereço, o tablet continua com a versão antiga.

## 3. Tablet e voz

O tablet roda o app **VACA** (View Assist Companion App), que faz duas coisas: é o satélite de voz (microfone, wake word, alto-falante) e mostra um painel do HA na tela. Sem o View Assist configurado para ele, o VACA abre o **painel padrão do HA**, então o painel padrão do usuário do tablet passa a ser a página do pet. O View Assist do Echo Show continua como está.

### 3.1 Usuário do tablet
Em **Configurações → Pessoas → Usuários → Adicionar usuário**, crie `Pet`, **sem** permissão de administrador. O pet só precisa ler as entidades, apertar `input_button.pet_carinho` e conversar com o Assist.

### 3.2 Pipeline de voz "Pet"
Em **Configurações → Assistentes de voz → Adicionar assistente**:
- Nome: `Pet`; idioma: Português (Brasil).
- Agente de conversa: Home Assistant por enquanto (o Gemini entra na Etapa 5), com **Preferir lidar com comandos localmente** ligado.
- Fala para texto e texto para fala: Home Assistant Cloud, pt-BR, com uma voz **diferente** da do Echo Show (LeilaNeural), para distinguir os dois.

Os pipelines atuais não mudam.

> Já criado em 2026-10-23 pelo conector: pipeline `Pet` (id `01m5mepaz8pdd06wfhsgdhhzvz`), voz **BrendaNeural**, agente Home Assistant, comandos locais preferidos. O pipeline preferido da casa continua sendo "Portugues HA".

### 3.3 App VACA no tablet
1. No tablet, baixe o APK mais recente em *github.com/msp1974/ViewAssist_Companion_App* → Releases e instale (o Android pede para permitir apps de fonte desconhecida).
2. Abra o app e conceda permissão de microfone.
3. No HA aparece um dispositivo VACA descoberto (Configurações → Dispositivos e serviços). Adicione. A integração VACA já está instalada por causa do Echo Show; se a versão do app for mais nova que a da integração, atualize a integração pelo HACS.
4. Na tela do app, entre no HA com o usuário `Pet` e marque **Manter conectado**.
5. Nas entidades do novo dispositivo VACA:
   - **Wake word**: escolha uma diferente de *Hey Jarvis* (a do Echo Show), por exemplo *Hey Mycroft* ou *Ok Nabu*. Senão os dois respondem juntos.
   - **Assistant**: `Pet`.
   - **Screen always on**: ligado.

### 3.4 Rótulo "Pet satélite"
Coloque o rótulo **Pet satélite** (já criado) na entidade `assist_satellite.vaca_<id>` **do tablet**, nunca na do Echo Show. Com ele, a saudação passa a ser falada e falar com o pet o acorda, inclusive à noite.

### 3.5 Cartão do pet (o que o tablet mostra)
Dentro do HA o pet roda como **cartão** (`custom:pet-face-card`), não como página em iframe. O cartão recebe a conexão do próprio frontend do HA, então não tem login nenhum. Por isso funciona no VACA, onde a página em iframe caía num login recusado ("Invalid redirect URI").

1. Copie `dist/pet-face-card.js` para `/config/www/pet/`.
2. Registre o recurso: **Configurações → Painéis → ⋮ → Recursos → Adicionar**, URL `/local/pet/pet-face-card.js?v=<versão>`, tipo **Módulo JavaScript**. A versão aparece no console do navegador (`pet-face-card <versão>`) e só precisa mudar a cada atualização do arquivo, por causa do cache de 31 dias de `/local/`.
3. Crie um painel comum (não "Página da web") com uma visualização do tipo **Painel** contendo o cartão:

```yaml
views:
  - title: Pet
    path: pet
    type: panel
    cards:
      - type: custom:pet-face-card
        entities:
          satellite: assist_satellite.vaca_<id>   # do tablet
          speech: sensor.vaca_<id>_tts            # texto da resposta falada
        # opcionais: agent_id, text_input: false, dev: true,
        #   hint: "texto da dica no pé da tela" ("" esconde), entities.ouvir: null (desliga o toque longo)
```

4. No tablet, logado como `Pet`: **Perfil → Painel padrão neste dispositivo → Pet Tablet**.

`speech` é o texto da resposta que o VACA fala; com ele, a legenda mostra a resposta de cada conversa.

**Tela cheia (sem cabeçalho e barra lateral do HA):** instale **Kiosk Mode** pelo HACS (*NemesisRE/kiosk-mode*; o HACS registra o recurso sozinho) e acrescente ao painel, no topo da configuração:

```yaml
kiosk_mode:
  user_settings:
    - users: ["pet"]
      hide_header: true
      hide_sidebar: true
```

Só o usuário `pet` vê o painel sem barras; com a sua conta, tudo continua normal. Para mexer no tablet, abra o painel com `?disable_km` no endereço.

> Instalado em 2026-10-23 pelo conector: recurso `/local/pet/pet-face-card.js?v=202610231605` e painel **Pet Tablet** (`/pet-tablet/pet`) com o satélite e o sensor do VACA do tablet. O painel antigo "Pet" (Página da web) pode ser apagado.

### 3.6 Página avulsa (opcional)
A página `index.html` com `pet.config.json` continua disponível para uso fora do HA (navegador comum, com login próprio). Dentro de painéis do HA, use o cartão.

### 3.7 Conferir
- Diga a wake word: o rosto fica atento (ouvindo), depois pensativo, depois fala com a legenda da resposta.
- À noite, com o pet dormindo, falar com ele o acorda; 5 min depois ele volta a dormir.
- Entre na sala de dia (depois do intervalo entre saudações): ele fica curioso e **fala** a saudação.
- Toque no rosto: reação de carinho e a frase aparece como legenda por alguns segundos.
- Segure o dedo parado no rosto por quase 1 s: ele fica ouvindo na hora, sem a wake word. Arrastar o dedo continua sendo carinho.
- Com o pet acordado e quieto, a dica "Para falar comigo, diga “Ok Nabu” ou segure meu rosto" aparece apagada no pé da tela. Ela some quando ele dorme, ouve, fala ou mostra uma legenda.
- O botão de teclado, no canto inferior esquerdo, permite perguntar por texto.

## 4. Modo quiosque (tablet)

### 4.1 No HA (feito pelo conector em 2026-10-23)
- **Tela cheia:** Kiosk Mode (HACS) no painel Pet Tablet, só para o usuário `pet` (seção 3.5).
- **VACA do tablet:** *Screen always on* ligado, *Auto brightness* **desligado** (senão o Android ignora o brilho definido pelo HA) e *Screen orientation* em **landscape**.
- **Escurecimento:** a automação "Pet · brilho da tela" põe o tablet em `input_number.pet_brilho_dormindo` (padrão 3%) quando o pet dorme e em `input_number.pet_brilho_dia` (padrão 60%) quando acorda. Ajuste os dois em Auxiliares; a mudança vale na hora.
- **Reconexão:** o cartão usa a conexão do próprio HA, que reconecta sozinha após queda de rede ou reinício do HA; enquanto isso, o rosto fica triste com o aviso discreto.

### 4.2 No Android do tablet (o dono faz)
- [ ] **Proteger a bateria** (fica sempre na tomada): Configurações → Bateria → Mais configurações → **Proteger bateria** (limite de 80–85%). Evita estufar a bateria.
- [ ] **Esconder a barra de navegação:** Configurações → Tela → Barra de navegação → **Gestos de deslizar**.
- [ ] **Fixar o VACA na tela** (ninguém sai do app sem querer): Configurações → Segurança e privacidade → Outras configurações de segurança → **Fixar janelas** (ligar). Depois, em Apps recentes, toque no ícone do VACA → **Fixar este app**. Para soltar: segure Voltar + Recentes.
- [ ] **Sem notificações por cima do rosto:** ative o **Não perturbe** sem horário de término, ou desligue as notificações dos apps do tablet.
- [ ] **Bateria do VACA sem restrição** (feito na instalação): Apps → VACA → Bateria → Sem restrição.
- [ ] **Teste de reinício:** desligue e ligue o tablet. O VACA deve abrir sozinho e voltar ao rosto; se não abrir, procure a opção de iniciar com o sistema nas configurações do app (menu de engrenagem na tela "Waiting connection").

### 4.3 Página avulsa como app (fora do VACA)
Para usar a página `index.html` num navegador comum em modo quiosque: abra `http://<HA>:8123/local/pet/index.html?kiosk=1`, toque uma vez (entra em tela cheia) e use "Adicionar à tela inicial" (o `manifest.webmanifest` abre em tela cheia e paisagem). Manter a tela ligada pela página (*Wake Lock*) só funciona em HTTPS; em HTTP na rede local, use a configuração de tela do aparelho.
