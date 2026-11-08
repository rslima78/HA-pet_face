# Tablet dedicado ao pet (Galaxy Tab A7 Lite, SM-T225, Android 14)

O tablet tem pouca memória (3 GB), então tudo o que roda em segundo plano disputa recurso com o VACA (microfone, wake word e o navegador do HA). O objetivo é deixar só o essencial.

**Não mexer** (o pet depende disto):
- **VACA**: o app do pet.
- **Android System WebView**: o navegador interno que mostra o HA.
- **Google Play Services** e **Play Store**: atualizam o WebView, que precisa estar em dia.
- **Teclado Samsung**: usado na pergunta por texto.
- **Configurações**, **Arquivos** (para instalar APKs) e o **Chrome** (para baixar atualizações do VACA; pode ser desativado depois).

Siga na ordem. Cada passo se desfaz pelo mesmo caminho.

## 1. Desativar ou desinstalar apps
Em **Configurações → Aplicativos**, abra cada app abaixo. Se aparecer **Desinstalar**, desinstale; se só aparecer **Desativar** (apps do sistema), desative.

- [ ] Redes e streaming pré-instalados: Facebook, Netflix, Spotify, YouTube, YouTube Music, Prime Video e similares.
- [ ] Google que o tablet não usa: Gmail, Maps, Fotos, Drive, Meet/Duo, Google TV, Google News, Google One, Assistente Google (o Assistente também disputa o microfone).
- [ ] Samsung que o tablet não usa: Samsung Free/Daily, Samsung Notes, Samsung Kids, Game Launcher/Game Booster, Samsung Health, Calendário Samsung, Galaxy Store (opcional), Samsung Internet, Samsung TV Plus, Smart Switch, Microsoft (OneDrive, Office) se houver.
- [ ] Apps que você mesmo instalou antes e não servem ao pet.
- [ ] Se tiver: **Fully Kiosk, Hassmic, Stream Assist** ou o app oficial do Home Assistant. Eles disputam o microfone com o VACA.

Se um app pedir para "restaurar a versão de fábrica" ao desativar, pode aceitar.

## 2. Bateria e segundo plano
Em **Configurações → Bateria → Limites de uso em segundo plano**:
- [ ] **Colocar apps sem uso em suspensão**: ligado.
- [ ] **Apps nunca suspensos** → adicionar **VACA** (essencial: sem isso o Android pode congelar o pet).
- [ ] **Apps em suspensão profunda** → adicionar o que sobrou e você não usa.

Em **Configurações → Bateria → Mais configurações**:
- [ ] **Proteger bateria**: ligado (limite de 80–85%; o tablet fica sempre na tomada).
- [ ] **Bateria adaptável**: desligado (não precisa economizar na tomada).

Em **Configurações → Assistência do aparelho** (Device care):
- [ ] **Otimização automática / Reiniciar automaticamente**: desligado, até confirmar no passo 7 que o VACA abre sozinho depois de reiniciar.

## 3. Tela
- [ ] **Configurações → Tela → Brilho adaptável**: desligado. O HA cuida do brilho; com o automático ligado, o Android brigaria com ele.
- [ ] **Configurações → Tela → Tempo limite da tela**: o máximo disponível (reserva; o VACA já mantém a tela ligada).
- [ ] **Configurações → Tela → Barra de navegação → Gestos de deslizar**: esconde os botões.
- [ ] **Configurações → Tela → Painéis Edge**: desligado (evita abrir sem querer na lateral).
- [ ] **Proteção contra toque acidental** e **Tela de descanso (protetor de tela)**: desligados.

## 4. Conexões e serviços que não servem ao pet
- [ ] **Bluetooth**: desligado.
- [ ] **Localização**: desligada.
- [ ] **Configurações → Contas e backup**: desligar sincronização automática de Samsung Cloud e do Google (fotos, contatos, agenda). Mantenha a conta Google conectada por causa da Play Store.
- [ ] **Configurações → Recursos avançados**: desligar Movimentos e gestos, Captura inteligente e afins.
- [ ] **Configurações → Sons**: sons de toque e de tecla desligados (o pet fala pelo alto-falante; não precisa de cliques).

## 5. Notificações
- [ ] **Configurações → Notificações → Não perturbe**: ligado, sem horário de término.
- [ ] Em **Notificações de apps**, desligue tudo exceto o VACA.

## 6. Atualizações
- [ ] **Play Store → Perfil → Configurações → Preferências de rede → Atualizar apps automaticamente**: "Somente Wi-Fi". Mantém o WebView atualizado (segurança e compatibilidade com o HA).
- [ ] **Configurações → Atualização de software → Baixar automaticamente por Wi-Fi**: pode ficar ligado. A instalação do sistema pede confirmação.

## 7. Fixar e testar
- [ ] **Configurações → Segurança e privacidade → Outras configurações de segurança → Fixar janelas**: ligado. Abra os apps recentes, toque no ícone do VACA → **Fixar este app**. Para soltar: segure Voltar + Recentes.
- [ ] **VACA como app inicial:** Configurações → Aplicativos → Escolher apps padrão → **App inicial → VACA**. É o que faz o VACA abrir sozinho depois de reiniciar: no Android 14, abrir pelo aviso de boot exige a permissão de sobrepor outros apps, e o VACA não a pede. Para voltar à tela da Samsung, escolha "One UI Home" ali.
- [ ] **Teste de reinício:** desligue e ligue o tablet. O VACA deve abrir sozinho e voltar ao rosto (verificado em 23/10/2026).
- [ ] Depois de tudo, diga **"Ok Nabu, que horas são?"**: o tempo de resposta deve ser igual ou melhor que antes.

## Opcional: Opções do desenvolvedor
Para ativar: **Configurações → Sobre o tablet → Informações do software** → toque 7 vezes em **Número de compilação**.
- [ ] **Escala de animação** (janela, transição e duração do Animator): 0,5x. O sistema fica mais ágil.
- [ ] **Permanecer ativo**: ligado. A tela não apaga enquanto carrega; é a reserva do "sempre ligada" do VACA.
- [ ] Não altere "Limite de processos em segundo plano": pode derrubar o VACA.

## Caminho automatizado (ADB)
Com **Opções do desenvolvedor → Depuração sem fio** ligada e pareada com o notebook, os apps podem ser desativados por comando, um a um e de forma reversível:

```text
adb shell pm list packages            # lista o que está instalado
adb shell pm disable-user --user 0 <pacote>   # desativa
adb shell pm enable <pacote>          # desfaz
```

O tablet continua recebendo atualizações e nada é apagado: `disable-user` só esconde e para o app.

### Aplicado em 23/10/2026
Antes: 554 MB de RAM disponível; o Assistente Google era o assistente padrão, com o detector de "Ok Google" ativo disputando o microfone com o VACA. Depois: 829 MB disponíveis e nenhum assistente do sistema.

Desativados (`pm disable-user --user 0`; desfazer com `adb shell pm enable <pacote>`):

```text
com.google.android.googlequicksearchbox   com.google.android.gm
com.google.android.youtube                com.google.android.apps.youtube.music
com.google.android.apps.photos            com.google.android.apps.magazines
com.google.android.videos                 com.google.android.apps.tachyon
com.google.android.apps.messaging         com.google.android.gms.location.history
com.netflix.mediaclient                   com.netflix.partner.activation
com.spotify.music                         com.lego.legobuildinginstructions
com.microsoft.skydrive                    com.samsung.android.app.notes
com.samsung.android.app.notes.addons      com.samsung.android.app.spage
com.samsung.android.voc                   com.samsung.shop
com.samsung.android.galaxy                com.sec.android.app.kidshome
com.samsung.android.kidsinstaller         com.samsung.android.app.parentalcare
com.samsung.android.game.gamehome         com.samsung.android.game.gos
com.sec.android.easyMover                 com.sec.android.easyMover.Agent
com.samsung.android.smartswitchassistant  com.samsung.android.app.smartcapture
com.samsung.android.stickercenter         com.samsung.android.app.dressroom
com.samsung.android.app.watchmanagerstub  com.samsung.android.privateshare
com.sec.android.app.sbrowser              com.rsupport.rs.activity.rsupport.aas2
com.samsung.android.app.sharelive         com.samsung.android.app.routines
com.samsung.android.forest                com.samsung.android.calendar
com.sec.android.app.popupcalculator       com.sec.android.app.samsungapps
com.samsung.android.app.settings.bixby
```

Estes vieram da loja e o Android não deixa o ADB desativá-los. Ficaram parados e proibidos de rodar em segundo plano (`cmd appops set <pacote> RUN_ANY_IN_BACKGROUND ignore`; desfazer com `allow`). Para tirá-los de vez, desinstale pela tela de Aplicativos:

```text
com.google.android.apps.docs   com.bo.fotoo   com.microsoft.office.outlook
com.microsoft.office.officehubrow   com.microsoft.bing   com.microsoft.appmanager
com.touchtype.swiftkey   com.sec.android.app.voicenote   br.com.vivo.vivoeasy
```

Mantidos de propósito: Chrome (grupo opcional, não aprovado), Mensagens Samsung e telefone (o modelo é LTE). O ScreenON foi desinstalado a pedido do dono (`pm uninstall com.eonsoft.ScreenON`).

Achado no mesmo dia: às 23:00 a tela apagou por tempo limite (60 s) e voltou na tela de bloqueio. A trava "tela sempre ligada" do VACA não segurou sozinha. Por isso **Permanecer ativo**, **Tempo limite da tela** no máximo e **Bloqueio de tela: Nenhum** são obrigatórios neste tablet, não opcionais.
