/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  shieldedProcedure,
  emailSchemas,
} from "@openloaf/api";
import type { PrismaClient } from "@openloaf/db";
import {
  saveDraftFile,
  readDraftFile,
  deleteDraftFile,
} from "@/modules/email/emailFileStore";
import type { StoredDraft } from "@/modules/email/emailFileStore";
import { logger } from "@/common/logger";
import { getErrorMessage } from "@/shared/errorMessages";
import { normalizeStringArray } from "./emailHelpers";

export const draftProcedures = {
  saveDraft: shieldedProcedure
    .input(emailSchemas.saveDraft.input)
    .output(emailSchemas.saveDraft.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const id = input.id || crypto.randomUUID();
      const now = new Date();
      const row = await (prisma as any).emailDraft.upsert({
        where: { id },
        create: {
          id,

          accountEmail: input.accountEmail,
          mode: input.mode,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          inReplyTo: input.inReplyTo ?? null,
          references: input.references ?? null,
        },
        update: {
          accountEmail: input.accountEmail,
          mode: input.mode,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          inReplyTo: input.inReplyTo ?? null,
          references: input.references ?? null,
        },
      });
      // 逻辑：body 存储到文件系统。
      const draftData: StoredDraft = {
        id: row.id,
        accountEmail: row.accountEmail,
        mode: row.mode,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        body: input.body,
        inReplyTo: row.inReplyTo ?? null,
        references: row.references ? normalizeStringArray(row.references) : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
      void saveDraftFile({

        accountEmail: input.accountEmail,
        draft: draftData,
      }).catch((err) => {
        logger.warn({ err, draftId: id }, "email file store draft save failed");
      });
      return {
        id: row.id,
        accountEmail: row.accountEmail,
        mode: row.mode,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        body: input.body,
        inReplyTo: row.inReplyTo ?? undefined,
        references: row.references ? normalizeStringArray(row.references) : undefined,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),

  listDrafts: shieldedProcedure
    .input(emailSchemas.listDrafts.input)
    .output(emailSchemas.listDrafts.output)
    .query(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const rows = await (prisma as any).emailDraft.findMany({
        orderBy: { updatedAt: "desc" },
      });
      // 逻辑：从文件系统读取 body。
      const results = await Promise.all(
        rows.map(async (row: any) => {
          const draftFile = await readDraftFile({

            accountEmail: row.accountEmail,
            draftId: row.id,
          });
          return {
            id: row.id,
            accountEmail: row.accountEmail,
            mode: row.mode,
            to: row.to,
            cc: row.cc,
            bcc: row.bcc,
            subject: row.subject,
            body: draftFile?.body ?? "",
            inReplyTo: row.inReplyTo ?? undefined,
            references: row.references ? normalizeStringArray(row.references) : undefined,
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
      );
      return results;
    }),

  getDraft: shieldedProcedure
    .input(emailSchemas.getDraft.input)
    .output(emailSchemas.getDraft.output)
    .query(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const row = await (prisma as any).emailDraft.findUnique({
        where: { id: input.id },
      });
      if (!row) throw new Error(getErrorMessage('DRAFT_NOT_FOUND', ctx.lang));
      // 逻辑：从文件系统读取 body。
      const draftFile = await readDraftFile({

        accountEmail: row.accountEmail,
        draftId: row.id,
      });
      return {
        id: row.id,
        accountEmail: row.accountEmail,
        mode: row.mode,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        body: draftFile?.body ?? "",
        inReplyTo: row.inReplyTo ?? undefined,
        references: row.references ? normalizeStringArray(row.references) : undefined,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),

  deleteDraft: shieldedProcedure
    .input(emailSchemas.deleteDraft.input)
    .output(emailSchemas.deleteDraft.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const row = await (prisma as any).emailDraft.findUnique({
        where: { id: input.id },
      });
      await (prisma as any).emailDraft.delete({
        where: { id: input.id },
      });
      // 逻辑：同时删除文件系统中的草稿文件。
      if (row) {
        void deleteDraftFile({

          accountEmail: row.accountEmail,
          draftId: input.id,
        }).catch((err) => {
          logger.warn({ err, draftId: input.id }, "email file store draft delete failed");
        });
      }
      return { ok: true };
    }),
};
