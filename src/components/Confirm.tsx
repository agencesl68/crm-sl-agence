import { useEffect, useState } from 'react'
import { Button, Modal } from './ui'

interface Request { message: string; resolve: (ok: boolean) => void }
let show: ((r: Request) => void) | null = null

/**
 * Demande de confirmation dans l'application : la visionneuse claude.ai ne montre
 * jamais les boîtes de dialogue du navigateur.
 */
export function ask(message: string): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ message, resolve }) : resolve(window.confirm(message))))
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null)
  useEffect(() => { show = setReq; return () => { show = null } }, [])
  if (!req) return null
  const close = (ok: boolean) => { req.resolve(ok); setReq(null) }
  return (
    <Modal title="Confirmer" onClose={() => close(false)}>
      <p className="text-sm leading-relaxed text-slate-700">{req.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={() => close(false)}>Annuler</Button>
        <Button variant="primary" onClick={() => close(true)} autoFocus>Confirmer</Button>
      </div>
    </Modal>
  )
}
