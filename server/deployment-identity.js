// The fixed MongoDB _id makes concurrent first boots claim the same identity.
export async function bindDeploymentDatabase(Identity, clubId, { verifyLicense } = {}) {
  if (!clubId) return
  if (verifyLicense) {
    const existing = await Identity.findById('main').lean()
    if (!existing) {
      const license = await verifyLicense()
      if (license.unavailable || license.status === 'invalid_license') {
        throw new Error('Não foi possível validar a licença para vincular este banco pela primeira vez. Confira as credenciais e a conexão com o Master.')
      }
    }
  }
  let identity
  try {
    identity = await Identity.findOneAndUpdate(
      { _id: 'main' },
      { $setOnInsert: { clubId } },
      { upsert: true, new: true },
    ).lean()
  } catch (error) {
    if (error?.code !== 11000) throw error
    // Another instance may win the first-boot upsert; verify its identity.
    identity = await Identity.findById('main').lean()
    if (!identity) throw error
  }
  if (identity.clubId !== clubId) {
    throw new Error('Este banco pertence a outro clube. Configure um banco exclusivo em MONGODB_URI antes de iniciar este serviço.')
  }
}
