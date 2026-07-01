export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        <em>Última atualização: {new Date().toLocaleDateString("pt-BR")}</em>
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Dados que Coletamos</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Contas de organizadores: nome, e-mail, chave PIX</li>
            <li>Compras de participantes: nome, e-mail</li>
            <li>Dados de eventos: título, descrição, local, datas, imagem de capa</li>
            <li>Registros de check-in: data e hora</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">Como Usamos os Dados</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Venda de ingressos e gerenciamento de eventos</li>
            <li>Processamento de pagamentos (delegado ao AbacatePay)</li>
            <li>Envio de e-mails de confirmação (delegado ao Resend)</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">Exclusão de Dados</h2>
          <p>
            Entre em contato pelo e-mail{" "}
            <a href="mailto:privacy@ticket.app" className="underline">
              privacy@ticket.app
            </a>{" "}
            para solicitar a exclusão dos seus dados pessoais. Processaremos a
            solicitação em até 30 dias.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">Armazenamento de Dados</h2>
          <p>
            Os dados são armazenados no Brasil (AWS sa-east-1) via Supabase. Os
            dados de pagamento são processados pelo AbacatePay e nunca são
            armazenados pela Ticket.
          </p>
        </div>
      </section>
    </main>
  );
}