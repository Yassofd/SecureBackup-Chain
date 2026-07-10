-- CreateTable
CREATE TABLE "sftp_servers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" VARCHAR(100) NOT NULL,
    "auth_type" VARCHAR(20) NOT NULL,
    "encrypted_credentials" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sftp_servers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sftp_servers" ADD CONSTRAINT "sftp_servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
