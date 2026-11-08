# PC no Home Assistant

Exemplo de como um notebook com Windows (aqui chamado **G15**) foi integrado ao HA para o pet saber quando o PC está em uso. Os IDs `g15_*` são os desta instalação: troque pelos do seu PC no pacote.

## Como está ligado
- **HASS.Agent 2.2.1** (fork da comunidade, `hass-agent/HASS.Agent`), conectado por **MQTT** ao Mosquitto do HA (porta 1883) e à API do HA por um token de longa duração (nome `HASS.Agent G15`).
- IP fixo para o PC (reserva no roteador).
- Dispositivo no HA: **G15**, área **Sala** (o PC fica ao lado do tablet do pet).
- Nenhuma entidade do PC está exposta ao Assist.

## Entidades
| Entidade | O que mostra |
|---|---|
| `sensor.g15_estado_sessao` | `Unlocked` / `Locked` |
| `sensor.g15_ultima_atividade` | quando o PC foi usado pela última vez |
| `sensor.g15_janela_ativa` | programa em primeiro plano |
| `sensor.g15_usuario_logado` | usuário do Windows |
| `sensor.g15_cpu`, `sensor.g15_memoria` | uso em % |
| `binary_sensor.g15_microfone_ativo` | algum app usando o microfone |
| `binary_sensor.g15_webcam_ativa` | algum app usando a webcam |
| `sensor.g15_audio_*` (12) | dispositivo, volume e mudo de saída e entrada |
| `button.g15_bloquear` | bloqueia a sessão |
| `button.g15_desligar_monitor` | apaga o monitor |
| `button.g15_suspender` | suspende o PC |
| `button.g15_varias_teclas` | comando `MultipleKeys` (teclas definidas no HASS.Agent) |

Desligar e reiniciar ficaram de fora **de propósito**.

Os IDs e nomes foram trocados no HA porque o HASS.Agent corta letras acentuadas (`estadodasess_o`). **Não renomeie sensores dentro do HASS.Agent**: isso pode criar entidades novas no HA.

## Microfone "ligado" sem uso
O sensor lê `HKCU\…\CapabilityAccessManager\ConsentStore\microphone` (e o mesmo em HKLM). Um app com `LastUsedTimeStop = 0` conta como "em uso". Isso acontece quando um app fecha à força e fica com a parada zerada.

Correção: preencher `LastUsedTimeStop` dessa entrada com a hora atual e **reiniciar o HASS.Agent**. Sem reiniciar, ele não enviou o novo estado. Para achar o culpado de novo:
```powershell
Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone' -Recurse |
  Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).LastUsedTimeStop -eq 0 } | Select-Object PSChildName
```

## O pet e o uso do PC
Está no pacote (`ha-package/pet.yaml`), seção "Uso do PC".

| Comportamento | Quando | Ajuste |
|---|---|---|
| Olhos (só na tela) | a cada 20 min de uso contínuo | `pet_pc_olhos_minutos` |
| Alongamento | a cada 30 min | `pet_pc_pausa_minutos` |
| Água | a cada 60 min | `pet_pc_agua_minutos` |
| Piada de "tempo demais" | a cada 2 h | `pet_pc_piada_minutos` |
| Convite para dormir | uso depois da 1h (até o fim da noite do pet) | `input_datetime.pet_pc_dormir_hora` |
| Início dos trabalhos | primeiro uso do dia, de dia: bom dia + previsão | — |
| Volta da pausa | uso depois de 10 min ou mais parado | `pet_pc_volta_minutos` |
| Monitor | 10 min parado → aviso; mais 5 min → desliga | `pet_pc_ocioso_minutos`, `pet_pc_monitor_aviso_minutos` |
| Chamada | microfone ou webcam: Echo da sala em Não perturbe, pet quieto | — |
| Modo foco | "Ok Nabu, modo foco 25 minutos" / "parar modo foco" | `pet_foco_minutos` |

Uso contínuo = sessão desbloqueada e atividade nos últimos 5 min (`binary_sensor.pet_pc_em_uso`).
