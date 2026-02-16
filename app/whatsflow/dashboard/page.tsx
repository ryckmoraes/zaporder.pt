"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { playBellIfEnabled } from "@/lib/sound";

const STORAGE_KEY = "whatsflow_session";
const SOUND_STORAGE_KEY = "whatsflowmenu-sound-enabled";

type UiStatus = "new" | "in-progress" | "completed";

interface SessionPayload {
  sessionToken: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  clientId: string;
  clientName?: string | null;
}

interface SessionValidationResponse {
  valid?: boolean;
  error?: string;
  userId?: string;
  userName?: string | null;
  userEmail?: string | null;
  clientId?: string;
  clientName?: string | null;
}

interface ApiOrder {
  id: string;
  orderNumber: string | null;
  status: string;
  orderData: unknown;
  createdAt: string | null;
  updatedAt: string | null;
}

interface OrdersResponse {
  client?: { id: string; name: string | null };
  user?: { id: string; name: string | null; email: string | null };
  orders?: ApiOrder[];
  error?: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface DashboardOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string | null;
  tableLabel: string;
  status: UiStatus;
  rawStatus: string;
  createdAt: Date;
  items: OrderItem[];
}

function readSession(): SessionPayload | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPayload;
    if (!parsed?.sessionToken || !parsed.userId || !parsed.clientId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: SessionPayload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // noop
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

function normalizeStatus(raw: string): UiStatus {
  const s = String(raw || "").toLowerCase();
  if (["in-progress", "preparacao", "preparing", "em-preparo", "em_preparo"].includes(s)) return "in-progress";
  if (["completed", "concluido", "concluído", "done", "finished"].includes(s)) return "completed";
  return "new";
}

function statusLabel(status: UiStatus) {
  if (status === "in-progress") return "Em preparação";
  if (status === "completed") return "Concluído";
  return "Novo";
}

function parseItems(orderData: unknown): OrderItem[] {
  if (!orderData || typeof orderData !== "object") return [];
  const d = orderData as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (Array.isArray(d.items)) candidates.push(d.items);
  if (d.order && typeof d.order === "object" && Array.isArray((d.order as Record<string, unknown>).items)) {
    candidates.push((d.order as Record<string, unknown>).items);
  }
  if (d.pedido && typeof d.pedido === "object" && Array.isArray((d.pedido as Record<string, unknown>).itens)) {
    candidates.push((d.pedido as Record<string, unknown>).itens);
  }

  const list = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!list) return [];

  return list.map((raw, idx) => {
    const r = (raw || {}) as Record<string, unknown>;
    const name = String(r.name ?? r.title ?? r.nome ?? `Item ${idx + 1}`);
    const quantity = Number(r.quantity ?? r.qtd ?? 1) || 1;
    const price = Number(r.price ?? r.valor ?? 0) || 0;
    const notes = r.notes ? String(r.notes) : undefined;
    const id = String(r.id ?? `${idx}`);
    return { id, name, quantity, price, notes };
  });
}

function parsePhone(orderData: unknown): string | null {
  if (!orderData || typeof orderData !== "object") return null;
  const d = orderData as Record<string, unknown>;
  const raw = d.customerPhone ?? d.customerphone ?? d.phone ?? d.telefoneCliente ?? d.telefone ?? null;
  if (!raw) return null;
  const only = String(raw).replace(/\D/g, "");
  if (!only) return null;
  if (/^\d{9}$/.test(only)) return `351${only}`;
  if (/^\d{11}$/.test(only)) return `55${only}`;
  return only;
}

function parseCustomerName(orderData: unknown): string {
  if (!orderData || typeof orderData !== "object") return "Cliente";
  const d = orderData as Record<string, unknown>;
  const value = d.customerName ?? d.customername ?? d.nome ?? d.name ?? d.cliente ?? "Cliente";
  return String(value);
}

function parseTable(orderData: unknown): string {
  if (!orderData || typeof orderData !== "object") return "Takeaway";
  const d = orderData as Record<string, unknown>;
  const value = d.table ?? d.mesa ?? d.deliveryType ?? "Takeaway";
  return String(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function WhatsFlowDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const knownOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOUND_STORAGE_KEY);
      if (raw !== null) setSoundEnabled(raw === "true");
    } catch {
      // noop
    }
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    } catch {
      // noop
    }
  };

  const sortOrders = (input: DashboardOrder[]) => {
    return [...input].sort((a, b) => {
      if (a.status === "in-progress" && b.status !== "in-progress") return -1;
      if (a.status !== "in-progress" && b.status === "in-progress") return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  };

  const fetchOrders = async (token: string): Promise<DashboardOrder[]> => {
    const response = await fetch("/api/whatsflow/orders", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = (await response.json()) as OrdersResponse;
    if (!response.ok) throw new Error(data?.error || "Erro ao carregar pedidos");

    const mapped = (data.orders || []).map((o) => {
      const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
      return {
        id: o.id,
        orderNo: o.orderNumber || o.id,
        customerName: parseCustomerName(o.orderData),
        customerPhone: parsePhone(o.orderData),
        tableLabel: parseTable(o.orderData),
        status: normalizeStatus(o.status),
        rawStatus: o.status,
        createdAt,
        items: parseItems(o.orderData),
      } as DashboardOrder;
    });

    return sortOrders(mapped);
  };

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = readSession();
      if (!stored) {
        clearSession();
        router.replace("/whatsflow/login");
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/admin/whatsflow-auth?sessionToken=${encodeURIComponent(stored.sessionToken)}`, {
          cache: "no-store",
        });
        const validation = (await res.json()) as SessionValidationResponse;
        if (!res.ok || !validation.valid || !validation.userId || !validation.clientId) {
          throw new Error(validation.error || "Sessão inválida");
        }

        const normalized: SessionPayload = {
          sessionToken: stored.sessionToken,
          userId: String(validation.userId),
          userName: validation.userName ?? stored.userName ?? null,
          userEmail: validation.userEmail ?? stored.userEmail ?? null,
          clientId: String(validation.clientId),
          clientName: validation.clientName ?? stored.clientName ?? null,
        };

        if (!active) return;
        setSession(normalized);
        saveSession(normalized);

        const firstOrders = await fetchOrders(normalized.sessionToken);
        if (!active) return;
        setOrders(firstOrders);
        firstOrders.forEach((o) => knownOrderIds.current.add(o.id));
      } catch (error) {
        if (!active) return;
        clearSession();
        setErrorMessage(error instanceof Error ? error.message : "Falha ao carregar dashboard");
        router.replace("/whatsflow/login");
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!session?.sessionToken) return;

    const pullLatest = async () => {
      try {
        const latest = await fetchOrders(session.sessionToken);
        const incomingNew = latest.filter((o) => !knownOrderIds.current.has(o.id));
        if (incomingNew.length > 0) {
          incomingNew.forEach((o) => knownOrderIds.current.add(o.id));
          if (soundEnabled) incomingNew.forEach(() => playBellIfEnabled());
        }
        setOrders(latest);
      } catch (error) {
        console.error("[WhatsFlow] Polling error", error);
      }
    };

    const timer = setInterval(pullLatest, 5000);

    const onFocus = () => {
      void pullLatest();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pullLatest();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.sessionToken, soundEnabled]);

  async function handleRefresh() {
    if (!session?.sessionToken) return;
    setIsRefreshing(true);
    try {
      const latest = await fetchOrders(session.sessionToken);
      setOrders(latest);
      latest.forEach((o) => knownOrderIds.current.add(o.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao atualizar");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function updateStatus(order: DashboardOrder, next: UiStatus) {
    if (!session?.sessionToken) return;

    const previous = [...orders];
    if (next === "completed") {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } else {
      setOrders((prev) =>
        sortOrders(prev.map((o) => (o.id === order.id ? { ...o, status: next, rawStatus: next } : o)))
      );
    }

    try {
      const res = await fetch("/api/whatsflow/orders/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify({ orderId: order.id, status: next }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha ao atualizar status");

      const description = next === "completed"
        ? `Pedido #${order.orderNo} concluído.`
        : `Pedido #${order.orderNo} em preparação.`;

      toast({
        title: next === "completed" ? "Pedido concluído" : "Pedido em preparação",
        description,
      });
      await handleRefresh();
      setSelectedOrder(null);
    } catch (error) {
      setOrders(previous);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o pedido",
      });
    }
  }

  function handleLogout() {
    clearSession();
    router.replace("/whatsflow/login");
  }

  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "completed"), [orders]);
  const completedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === "completed")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 25),
    [orders]
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Carregando dashboard WhatsFlow...
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">WhatsFlow</p>
            <h1 className="text-xl font-bold">Painel de Pedidos</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleSound}>
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? "Atualizando..." : "Atualizar"}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        {errorMessage ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        ) : null}

        {activeOrders.length === 0 ? (
          <div className="flex h-80 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <h2 className="text-xl font-semibold">Nenhum pedido pendente</h2>
            <p className="text-sm text-muted-foreground">Aguardando novos pedidos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {activeOrders.map((order) => {
              const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <Card
                  key={order.id}
                  className="cursor-pointer transition hover:shadow-md"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-1 text-base">{order.customerName}</CardTitle>
                      {order.status === "in-progress" ? (
                        <Badge className="bg-amber-500 text-white">Em preparo</Badge>
                      ) : (
                        <Badge variant="secondary">Novo</Badge>
                      )}
                    </div>
                    <CardDescription>#{order.orderNo}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p><strong>{totalItems}</strong> {totalItems === 1 ? "item" : "itens"}</p>
                    <p className="text-muted-foreground">{order.tableLabel}</p>
                    <p className="text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <section className="mt-8 rounded-lg border bg-muted/20 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico de pedidos concluídos
          </h3>
          {completedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido concluído neste ciclo.</p>
          ) : (
            <div className="space-y-2">
              {completedOrders.map((order) => (
                <div
                  key={`history-${order.id}`}
                  className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{order.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      #{order.orderNo} • {order.tableLabel}
                    </p>
                  </div>
                  <div className="ml-3 shrink-0 text-right text-xs text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="border-t bg-background/90">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 text-center text-sm text-muted-foreground">
          Cliente: <strong>{session?.clientName || "-"}</strong> | Usuário: <strong>{session?.userEmail || "-"}</strong>
        </div>
      </footer>

      <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl p-0">
          {selectedOrder ? (
            <div>
              <DialogHeader className="p-6">
                <DialogTitle>Pedido #{selectedOrder.orderNo}</DialogTitle>
                <DialogDescription>
                  {selectedOrder.customerName} - {selectedOrder.tableLabel}
                </DialogDescription>
              </DialogHeader>
              <Separator />
              <ScrollArea className="max-h-[55vh]">
                <div className="p-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Qtd</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item, index) => (
                        <TableRow key={`${item.id}-${index}`}>
                          <TableCell>{item.quantity}x</TableCell>
                          <TableCell>
                            <p>{item.name}</p>
                            {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
                          </TableCell>
                          <TableCell className="text-right">{formatMoney(item.price * item.quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
              <Separator />
              <div className="flex items-center justify-between gap-3 p-6">
                <div className="text-sm text-muted-foreground">
                  Status atual: <strong className={cn("ml-1", selectedOrder.status === "in-progress" ? "text-amber-600" : "")}>{statusLabel(selectedOrder.status)}</strong>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={selectedOrder.status === "in-progress"}
                    onClick={() => updateStatus(selectedOrder, "in-progress")}
                  >
                    <ChefHat className="mr-2 h-4 w-4" /> Em preparação
                  </Button>
                  <Button
                    onClick={() => updateStatus(selectedOrder, "completed")}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Check className="mr-2 h-4 w-4" /> Concluir
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
