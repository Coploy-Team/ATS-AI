type RetroEmailData = {
  companyName: string
  totalInterviews: number
  totalJobs: number
  npsScore: number
  videoUrl: string | null
}

export function generateRetroEmailHtml(data: RetroEmailData): string {
  const { companyName, totalInterviews, totalJobs, npsScore, videoUrl } = data

  // Formatar números para exibição
  const formattedInterviews = totalInterviews.toLocaleString('pt-BR')
  const formattedJobs = totalJobs.toLocaleString('pt-BR')

  // Calcular satisfação baseada no NPS (NPS vai de -100 a 100, convertemos para %)
  const satisfactionPercentage = Math.max(
    0,
    Math.min(100, Math.round((npsScore + 100) / 2))
  )

  // Renderizar seção de vídeo apenas se existir URL
  const videoSection = videoUrl
    ? `
    <!-- Video Section -->
    <tr>
      <td style="padding: 40px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #181920; border-radius: 24px; border: 2px solid #84cc16; overflow: hidden;">
          <tr>
            <td style="padding: 50px 40px; text-align: center;">
              
              <!-- Play Button with emoji fallback -->
              <a href="${videoUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #84cc16 0%, #65a30d 100%); width: 90px; height: 90px; border-radius: 50%; text-align: center; vertical-align: middle; box-shadow: 0 8px 32px rgba(132, 204, 22, 0.5);">
                      <span style="font-size: 36px; line-height: 90px;">▶️</span>
                    </td>
                  </tr>
                </table>
              </a>
              
              <!-- Title -->
              <p style="margin: 28px 0 10px 0; color: #ffffff; font-size: 26px; font-weight: 600;">
                🎬 Sua Retrospectiva 2025
              </p>
              <p style="margin: 0 0 28px 0; color: #a0a3a8; font-size: 15px; font-weight: 300;">
                Vídeo exclusivo e personalizado da <strong style="color: #84cc16;">${companyName}</strong>
              </p>
              
              <!-- CTA Button -->
              <a href="${videoUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #84cc16 0%, #65a30d 100%); color: #0f1014; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 20px rgba(132, 204, 22, 0.35);">
                Assistir Agora →
              </a>
              
              <!-- Subtitle -->
              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; font-weight: 300;">
                ✨ Reviva os melhores momentos do ano
              </p>
              
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : ''

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Retrospectiva 2025 - Coploy</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f1014;">
  
  <!-- Main Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #0f1014;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Content Container -->
        <table width="680" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 680px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 40px;">
              <img src="https://dashboard.coploy.io/assets/coploy_dark-Dc1v9MpQ.png" alt="Coploy" width="64" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Hero Section -->
          <tr>
            <td style="text-align: center; padding: 60px 0 50px 0; background: linear-gradient(180deg, #14151a 0%, #0f1014 100%); border-radius: 24px 24px 0 0;">
              <!-- Decorative elements -->
              <div style="font-size: 40px; margin-bottom: 20px;">✨ 🎊 🎉 ⭐</div>
              
              <!-- Badge -->
              <div style="display: inline-block; background: linear-gradient(135deg, #84cc16 0%, #65a30d 100%); border-radius: 50px; padding: 10px 28px; margin-bottom: 20px;">
                <span style="color: #0f1014; font-size: 13px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase;">RETROSPECTIVA</span>
              </div>
              
              <h1 style="margin: 0; color: #ffffff; font-size: 72px; font-weight: 700; letter-spacing: -2px;">
                2025
              </h1>
              <p style="margin: 16px 0 0 0; color: #a0a3a8; font-size: 18px; font-weight: 400;">
                Um ano incrível juntos! 🚀
              </p>
            </td>
          </tr>

          <!-- Greeting Section -->
          <tr>
            <td style="padding: 50px 40px 30px 40px; background-color: #14151a;">
              <h2 style="margin: 0 0 24px 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                Olá, ${companyName}! 👋
              </h2>
              <p style="margin: 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                Que ano incrível vivemos juntos em 2025!
              </p>
              <p style="margin: 20px 0 0 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                A <strong style="color: #84cc16;">Coploy</strong> quer começar esta mensagem dizendo <strong style="color: #ffffff;">muito obrigado</strong> por ter você com a gente, acreditando na nossa forma de conectar inteligência artificial e talento humano para deixar os processos seletivos mais ágeis, precisos e humanos.
              </p>
            </td>
          </tr>

          <!-- Stats Intro -->
          <tr>
            <td style="padding: 20px 40px 30px 40px; background-color: #14151a;">
              <p style="margin: 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                Ao longo deste ano, sua parceria foi essencial para que nossa plataforma desse novos passos: seguimos pioneiros em entrevistas em vídeo com IA no Brasil e chegamos à marca de:
              </p>
            </td>
          </tr>

          <!-- Stats Grid -->
          <tr>
            <td style="padding: 0 40px 40px 40px; background-color: #14151a;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="48%" style="padding: 8px;">
                    <div style="background: linear-gradient(135deg, #ec4899 0%, #be185d 100%); border-radius: 20px; padding: 32px 24px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 48px; font-weight: 700; line-height: 1;">${formattedInterviews}</p>
                      <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 500;">Entrevistas Realizadas</p>
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="padding: 8px;">
                    <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 20px; padding: 32px 24px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 48px; font-weight: 700; line-height: 1;">${formattedJobs}</p>
                      <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 500;">Vagas Gerenciadas</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colspan="3" style="padding: 8px;">
                    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 20px; padding: 32px 24px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 48px; font-weight: 700; line-height: 1;">${satisfactionPercentage}%</p>
                      <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 500;">Satisfação (NPS)</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message Section -->
          <tr>
            <td style="padding: 20px 40px 40px 40px; background-color: #14151a;">
              <p style="margin: 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                Encerrar 2025 ao seu lado, como cliente e parceiro, é motivo de <strong style="color: #ffffff;">orgulho</strong> por aqui! Por isso, preparamos uma <strong style="color: #84cc16;">retrospectiva personalizada</strong> com os principais resultados da sua empresa com a Coploy neste ano.
              </p>
            </td>
          </tr>

          ${videoSection}

          <!-- 2026 Section -->
          <tr>
            <td style="padding: 40px; background-color: #14151a;">
              <div style="background: linear-gradient(135deg, #1a1c20 0%, #181920 100%); border-radius: 20px; padding: 40px; border-left: 4px solid #84cc16;">
                <p style="margin: 0 0 20px 0; color: #84cc16; font-size: 22px; font-weight: 600;">
                  🌟 Em 2026, queremos estar ainda mais presentes!
                </p>
                <p style="margin: 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                  Ajudando seu RH a ganhar tempo, aumentar a assertividade das contratações e criar experiências cada vez melhores para candidatos e equipes.
                </p>
                <p style="margin: 20px 0 0 0; color: #a0a3a8; font-size: 16px; line-height: 1.8; font-weight: 300;">
                  <strong style="color: #ffffff;">Conte com a Coploy no próximo ano!</strong> Nossa plataforma segue evoluindo para entregar processos seletivos mais rápidos, inteligentes e eficientes, sem perder a essência humana de cada história profissional.
                </p>
              </div>
            </td>
          </tr>

          <!-- Closing Section -->
          <tr>
            <td style="padding: 40px; text-align: center; background-color: #14151a;">
              <div style="background: linear-gradient(135deg, #1a1c20 0%, #0f1014 100%); border-radius: 24px; padding: 50px 40px;">
                <p style="margin: 0 0 16px 0; font-size: 40px;">🎆</p>
                <p style="margin: 0 0 16px 0; color: #84cc16; font-size: 36px; font-weight: 700;">
                  Feliz 2026!
                </p>
                <p style="margin: 0; color: #a0a3a8; font-size: 16px; line-height: 1.7; font-weight: 300;">
                  Desejamos a você, sua família e todo o seu time, um ano cheio de <strong style="color: #ffffff;">saúde, conquistas e ótimas contratações</strong>.
                </p>
                <p style="margin: 30px 0 0 0; color: #84cc16; font-size: 18px; font-weight: 600;">
                  Seguimos juntos! 🤝
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 50px 40px; text-align: center; background-color: #0f1014; border-top: 1px solid #2a2d33; border-radius: 0 0 24px 24px;">
              <img src="https://dashboard.coploy.io/assets/coploy_dark-Dc1v9MpQ.png" alt="Coploy" width="120" style="display: block; margin: 0 auto 20px auto; opacity: 0.7;" />
              <p style="margin: 0 0 16px 0; color: #a0a3a8; font-size: 14px; font-weight: 300;">
                Potencialize o recrutamento com inteligência, dados e humanidade.
              </p>
              <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 12px; font-weight: 300;">
                © 2025 Coploy. Todos os direitos reservados.
              </p>
              <p style="margin: 0;">
                <a href="https://coploy.io" style="color: #84cc16; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">Site</a>
                <a href="https://www.linkedin.com/company/coploy" style="color: #84cc16; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">LinkedIn</a>
                <a href="https://www.instagram.com/coploy.io" style="color: #84cc16; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">Instagram</a>
              </p>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>

</body>
</html>
`
}
