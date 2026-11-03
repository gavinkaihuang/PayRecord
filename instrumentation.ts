// Boot-time guard: refuse to start a production server without a real JWT
// secret. The fallback in lib/auth.ts is a well-known string - running prod
// with it would let anyone forge login tokens. Skipped during `next build`
// and in dev so local workflows keep working.
export async function register() {
    if (
        process.env.NODE_ENV === 'production' &&
        process.env.NEXT_PHASE !== 'phase-production-build'
    ) {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret-key-change-it') {
            throw new Error(
                '[PayRecord] JWT_SECRET 缺失或仍为默认值 - 在 .env 设置强随机值 (openssl rand -hex 32) 后再启动。拒绝以可伪造令牌的状态上线。'
            );
        }
    }
}
