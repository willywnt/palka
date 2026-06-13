'use client';

import { useState } from 'react';
import { Check, Copy, MoreHorizontal, Send, Ticket, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge, type StatusTone } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import { orgRoleLabel } from '@/lib/org-role';
import { useOrg } from '@/modules/users/hooks/use-org';
import {
  useCreateInviteMutation,
  useRemoveMemberMutation,
  useRevokeInviteMutation,
  useTeamInvitesQuery,
  useTeamMembersQuery,
  useUpdateMemberRoleMutation,
} from '@/modules/users/hooks/use-team';
import type { TeamInviteItem, TeamMemberItem } from '@/modules/users/types';
import type { OrgRole } from '@falka/types';

const ROLE_TONE: Record<OrgRole, StatusTone> = {
  OWNER: 'info',
  ADMIN: 'ok',
  STAFF: 'neutral',
};

function RoleBadge({ role }: { role: OrgRole }) {
  return <StatusBadge tone={ROLE_TONE[role]}>{orgRoleLabel(role)}</StatusBadge>;
}

/** "Tim" tab body — manage members and pending invites. */
export function TeamSettings() {
  const { org } = useOrg();
  const isOwner = org?.role === 'OWNER';

  return (
    <div className="space-y-6">
      <MembersSection isOwner={isOwner} />
      <Separator />
      <InvitesSection isOwner={isOwner} />
    </div>
  );
}

function MembersSection({ isOwner }: { isOwner: boolean }) {
  const { data, isLoading, error, refetch } = useTeamMembersQuery();

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Anggota</p>
        <p className="text-muted-foreground text-sm">
          Orang yang punya akses ke toko kamu beserta perannya.
        </p>
      </div>

      {error ? (
        <ErrorState
          title="Gagal memuat anggota tim"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada anggota lain"
          description="Buat undangan di bawah buat menambah orang ke tim."
        />
      ) : (
        <MembersTable members={data} isOwner={isOwner} />
      )}
    </section>
  );
}

function MembersTable({ members, isOwner }: { members: TeamMemberItem[]; isOwner: boolean }) {
  return (
    <>
      {/* Cards on phones, table on sm+. */}
      <ul className="space-y-3 sm:hidden">
        {members.map((member) => (
          <li key={member.userId} className="border-border/70 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.name}</p>
                <p className="text-muted-foreground truncate text-xs break-all">{member.email}</p>
              </div>
              <MemberActions member={member} isOwner={isOwner} />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
              <RoleBadge role={member.role} />
              <span>Bergabung {formatDateTime(member.joinedAt)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Bergabung</TableHead>
              <TableHead className="w-12 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-muted-foreground text-xs break-all">{member.email}</p>
                </TableCell>
                <TableCell>
                  <RoleBadge role={member.role} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDateTime(member.joinedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <MemberActions member={member} isOwner={isOwner} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Owner-only ⋯ actions; nothing rendered for the OWNER row or the viewer's own row. */
function MemberActions({ member, isOwner }: { member: TeamMemberItem; isOwner: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateRole = useUpdateMemberRoleMutation();
  const removeMember = useRemoveMemberMutation();

  if (!isOwner || member.role === 'OWNER' || member.isSelf) {
    return null;
  }

  const nextRole: OrgRole = member.role === 'ADMIN' ? 'STAFF' : 'ADMIN';
  const roleActionLabel = nextRole === 'ADMIN' ? 'Jadikan admin' : 'Jadikan staf';
  const busy = updateRole.isPending || removeMember.isPending;

  async function handleRoleChange() {
    try {
      await updateRole.mutateAsync({ userId: member.userId, role: nextRole });
      toast.success(`${member.name} sekarang ${orgRoleLabel(nextRole).toLowerCase()}`);
    } catch (err) {
      toast.error('Gagal mengubah peran', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleRemove() {
    try {
      await removeMember.mutateAsync(member.userId);
      toast.success(`${member.name} dikeluarkan dari tim`);
      setConfirmOpen(false);
    } catch (err) {
      toast.error('Gagal mengeluarkan anggota', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Aksi untuk {member.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void handleRoleChange()}>
            {roleActionLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
              Keluarkan dari tim
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keluarkan {member.name} dari tim?</AlertDialogTitle>
          <AlertDialogDescription>
            Dia akan langsung kehilangan akses ke toko ini. Kamu bisa mengundangnya lagi nanti.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMember.isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'destructive' }))}
            disabled={removeMember.isPending}
            onClick={(event) => {
              event.preventDefault();
              void handleRemove();
            }}
          >
            {removeMember.isPending ? 'Mengeluarkan…' : 'Keluarkan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InvitesSection({ isOwner }: { isOwner: boolean }) {
  const { data, isLoading, error, refetch } = useTeamInvitesQuery();
  const createInvite = useCreateInviteMutation();
  const [role, setRole] = useState<OrgRole>('STAFF');
  const [newCode, setNewCode] = useState<string | null>(null);

  async function handleCreate() {
    // STAFF can only invite STAFF; the Admin option is disabled for them, but guard anyway.
    const requested: OrgRole = isOwner ? role : 'STAFF';
    try {
      const invite = await createInvite.mutateAsync(requested);
      setNewCode(invite.code);
      toast.success('Kode undangan dibuat');
    } catch (err) {
      toast.error('Gagal membuat undangan', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Undangan</p>
        <p className="text-muted-foreground text-sm">
          Buat kode sekali pakai, lalu bagikan ke orang yang mau kamu undang.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buat undangan</CardTitle>
          <CardDescription>
            Pilih peran, lalu bagikan kodenya. Penerima memasukkannya saat mendaftar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as OrgRole)}
              aria-label="Peran undangan"
              className="sm:w-40"
            >
              <option value="STAFF">Staf</option>
              <option value="ADMIN" disabled={!isOwner}>
                Admin
              </option>
            </Select>
            <Button
              onClick={() => void handleCreate()}
              disabled={createInvite.isPending}
              className="sm:shrink-0"
            >
              <UserPlus className="size-4" />
              {createInvite.isPending ? 'Membuat…' : 'Buat kode'}
            </Button>
          </div>
          {!isOwner ? (
            <p className="text-muted-foreground text-xs">
              Cuma pemilik toko yang bisa mengundang admin.
            </p>
          ) : null}
          {newCode ? (
            <div className="border-status-ok/30 bg-status-ok/10 flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-muted-foreground text-xs">Kode baru</p>
                <p className="num text-lg font-semibold tracking-widest">{newCode}</p>
              </div>
              <CopyCodeButton code={newCode} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <ErrorState
          title="Gagal memuat undangan"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="Belum ada undangan aktif"
          description="Kode yang kamu buat akan muncul di sini sampai dipakai atau dicabut."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Kode disalin');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Gagal menyalin kode');
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      Salin
    </Button>
  );
}

function InviteRow({ invite }: { invite: TeamInviteItem }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revokeInvite = useRevokeInviteMutation();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invite.code);
      toast.success('Kode disalin');
    } catch {
      toast.error('Gagal menyalin kode');
    }
  }

  function handleShare() {
    const origin = window.location.origin;
    const text = `Gabung ke tokoku di Falka. Buka ${origin}/register dan masukkan kode undangan: ${invite.code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  async function handleRevoke() {
    try {
      await revokeInvite.mutateAsync(invite.id);
      toast.success('Undangan dicabut');
      setConfirmOpen(false);
    } catch (err) {
      toast.error('Gagal mencabut undangan', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <li className="border-border/70 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num text-base font-semibold tracking-widest">{invite.code}</span>
        <RoleBadge role={invite.role} />
        <span className="text-muted-foreground text-xs">
          Kedaluwarsa {formatDateTime(invite.expiresAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
          <Copy className="size-4" />
          Salin
        </Button>
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Send className="size-4" />
          WhatsApp
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              Cabut
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cabut undangan ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Kode {invite.code} tidak akan bisa dipakai lagi untuk gabung ke tim.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={revokeInvite.isPending}>Batal</AlertDialogCancel>
              <AlertDialogAction
                className={cn(buttonVariants({ variant: 'destructive' }))}
                disabled={revokeInvite.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  void handleRevoke();
                }}
              >
                {revokeInvite.isPending ? 'Mencabut…' : 'Cabut'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
