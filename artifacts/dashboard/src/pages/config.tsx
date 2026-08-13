import { useGetConfig, useUpdateConfig, getGetConfigQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, Save, Settings2, KeyRound, Eye, EyeOff,
  Wifi, WifiOff, Clock, Bell, Send, Loader2, FlaskConical, Wrench, Trash2, TriangleAlert
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Config() {
  const { data: config, isLoading } = useGetConfig();
  const updateConfig = useUpdateConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localAutoFulfill, setLocalAutoFulfill] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [secondBotToken, setSecondBotToken] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [adminChatId, setAdminChatId] = useState("");
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [showSecondBotToken, setShowSecondBotToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [canbosoUsername, setCanbosoUsername] = useState("");
  const [canbosoPassword, setCanbosoPassword] = useState("");
  const [showCanbosoPassword, setShowCanbosoPassword] = useState(false);
  const [testingCanboso, setTestingCanboso] = useState(false);
  const [savingCanboso, setSavingCanboso] = useState(false);

  const initialized = useRef(false);
  useEffect(() => {
    if (config && !initialized.current) {
      setLocalAutoFulfill(config.autoFulfill);
      initialized.current = true;
    }
  }, [config]);

  const handleTestBot = async () => {
    setTestingBot(true);
    try {
      const res = await fetch(`${BASE}/api/actions/test-bot`, { method: "POST" });
      const data = await res.json();
      toast({ title: data.ok ? "✅ Bot hoạt động!" : "❌ Lỗi", description: data.message, variant: data.ok ? "default" : "destructive" });
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setTestingBot(false);
    }
  };

  const handleTestCanboso = async () => {
    setTestingCanboso(true);
    try {
      const body: Record<string, string> = {};
      if (canbosoUsername.trim()) body.username = canbosoUsername.trim();
      if (canbosoPassword.trim()) body.password = canbosoPassword.trim();
      const res = await fetch(`${BASE}/api/actions/test-canboso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      toast({ title: data.ok ? "✅ Canboso kết nối OK" : "❌ Lỗi Canboso", description: data.message, variant: data.ok ? "default" : "destructive" });
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setTestingCanboso(false);
    }
  };

  const handleSaveCanboso = async () => {
    if (!canbosoUsername.trim() && !canbosoPassword.trim()) return;
    setSavingCanboso(true);
    try {
      const updates: Record<string, string> = {};
      if (canbosoUsername.trim()) updates.canbosoUsername = canbosoUsername.trim();
      if (canbosoPassword.trim()) updates.canbosoPassword = canbosoPassword.trim();
      const res = await fetch(`${BASE}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      queryClient.setQueryData(getGetConfigQueryKey(), updated);
      setCanbosoUsername("");
      setCanbosoPassword("");
      toast({ title: "✅ Đã lưu tài khoản Canboso" });
    } catch {
      toast({ title: "Lỗi khi lưu", variant: "destructive" });
    } finally {
      setSavingCanboso(false);
    }
  };

  const handleTestApi = async () => {
    setTestingApi(true);
    try {
      const res = await fetch(`${BASE}/api/source/status`);
      const data = await res.json();
      if (data.online) {
        const fmt = (v: number) => v.toLocaleString("vi-VN");
        toast({ title: "✅ API nguồn kết nối OK", description: `Số dư: ${fmt(data.balance ?? 0)}đ · ${data.products?.length ?? 0} sản phẩm` });
      } else {
        toast({ title: "❌ API nguồn không kết nối được", description: data.error ?? "Lỗi không xác định", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setTestingApi(false);
    }
  };

  const { data: canbosoStatus } = useQuery({
    queryKey: ["canboso-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/mappings/canboso-products`);
      if (!res.ok) return { connected: false };
      const d = await res.json();
      return { connected: true, productCount: d.products?.length ?? 0 };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const handleToggleMaintenance = () => {
    updateConfig.mutate(
      { data: { maintenanceMode: !config?.maintenanceMode } },
      {
        onSuccess: (newConfig) => {
          queryClient.setQueryData(getGetConfigQueryKey(), newConfig);
          toast({ title: newConfig.maintenanceMode ? "🔧 Đã bật chế độ bảo trì" : "✅ Đã tắt bảo trì — hệ thống hoạt động" });
        },
        onError: () => toast({ title: "Lỗi", variant: "destructive" }),
      },
    );
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const res = await fetch(`${BASE}/api/data/all`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries();
      toast({ title: "🗑 Đã xoá toàn bộ dữ liệu" });
    } catch {
      toast({ title: "Lỗi khi xoá dữ liệu", variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleSaveSettings = () => {
    updateConfig.mutate(
      { data: { autoFulfill: localAutoFulfill } },
      {
        onSuccess: (newConfig) => {
          queryClient.setQueryData(getGetConfigQueryKey(), newConfig);
          toast({ title: "Đã lưu cài đặt" });
        },
        onError: () => toast({ title: "Lỗi", description: "Không thể lưu.", variant: "destructive" }),
      },
    );
  };

  const handleSaveCredentials = () => {
    const updates: Record<string, any> = {};
    if (botToken.trim()) updates.mainBotToken = botToken.trim();
    if (secondBotToken.trim()) updates.secondBotToken = secondBotToken.trim();
    if (apiUrl.trim()) updates.sourceBotApiUrl = apiUrl.trim();
    if (apiKey.trim()) updates.sourceBotApiKey = apiKey.trim();
    if (adminChatId.trim()) updates.adminChatId = adminChatId.trim();

    // lowBalanceThreshold: empty string clears the value (sends null); non-empty must be a valid integer
    if (lowBalanceThreshold.trim() === "" && typeof config?.lowBalanceThreshold === "number") {
      // User cleared the field — send null to remove the threshold
      updates.lowBalanceThreshold = null;
    } else if (lowBalanceThreshold.trim() !== "") {
      const parsed = parseInt(lowBalanceThreshold.trim(), 10);
      if (isNaN(parsed) || parsed < 0) {
        toast({ title: "Giá trị không hợp lệ", description: "Ngưỡng số dư phải là số nguyên dương.", variant: "destructive" });
        return;
      }
      updates.lowBalanceThreshold = parsed;
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "Không có thay đổi", description: "Điền ít nhất một trường.", variant: "destructive" });
      return;
    }

    updateConfig.mutate(
      { data: updates },
      {
        onSuccess: (newConfig) => {
          queryClient.setQueryData(getGetConfigQueryKey(), newConfig);
          setBotToken(""); setSecondBotToken(""); setApiUrl(""); setApiKey(""); setAdminChatId(""); setLowBalanceThreshold("");
          toast({ title: "Đã lưu thông tin kết nối" });
        },
        onError: () => toast({ title: "Lỗi", description: "Không thể lưu.", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-muted w-1/3 rounded" />
        <div className="h-32 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài Đặt</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Kết nối API và hành vi xử lý đơn tự động.</p>
      </div>

      {/* Status row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusPill
          label="Canboso.com"
          ok={canbosoStatus?.connected}
          detail={canbosoStatus?.connected ? `${canbosoStatus.productCount} sản phẩm` : "Chưa kết nối"}
          icon={canbosoStatus?.connected ? Wifi : WifiOff}
        />
        <StatusPill
          label="Bot chính (VN)"
          ok={config?.mainBotTokenSet}
          detail={config?.mainBotTokenSet ? "Đã cấu hình" : "Chưa có token"}
          icon={CheckCircle2}
        />
        <StatusPill
          label="Bot phụ (EN)"
          ok={config?.secondBotTokenSet}
          detail={config?.secondBotTokenSet ? "Đã cấu hình" : "Chưa có token"}
          icon={CheckCircle2}
        />
        <StatusPill
          label="API Nguồn Hàng"
          ok={config?.sourceBotApiUrlSet && config?.sourceBotApiKeySet}
          detail={config?.sourceBotApiUrlSet ? "Đã cấu hình" : "Chưa có URL/Key"}
          icon={CheckCircle2}
        />
      </div>

      {/* Canboso account */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Tài Khoản Canboso</CardTitle>
          </div>
          <CardDescription>
            Tài khoản đăng nhập Canboso.com. Để trống để giữ nguyên giá trị đã lưu.
            {config?.canbosoUsername && (
              <span className="block mt-1 text-foreground font-medium">
                Đang dùng: <span className="font-mono">{config.canbosoUsername}</span>
                {" · "}
                <span className={config.canbosoPasswordSet ? "text-green-600" : "text-destructive"}>
                  {config.canbosoPasswordSet ? "Mật khẩu đã cấu hình" : "Chưa có mật khẩu"}
                </span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên đăng nhập</label>
              <Input
                value={canbosoUsername}
                onChange={(e) => setCanbosoUsername(e.target.value)}
                placeholder={config?.canbosoUsername ?? "username@canboso"}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mật khẩu</label>
              <div className="relative">
                <Input
                  type={showCanbosoPassword ? "text" : "password"}
                  value={canbosoPassword}
                  onChange={(e) => setCanbosoPassword(e.target.value)}
                  placeholder={config?.canbosoPasswordSet ? "••••• (đã cấu hình)" : "Nhập mật khẩu"}
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCanbosoPassword(v => !v)}
                >
                  {showCanbosoPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleTestCanboso}
              disabled={testingCanboso}
            >
              {testingCanboso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
              {testingCanboso ? "Đang kiểm tra..." : "Test kết nối"}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={handleSaveCanboso}
              disabled={savingCanboso || (!canbosoUsername.trim() && !canbosoPassword.trim())}
            >
              {savingCanboso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savingCanboso ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto-fulfill */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Tự Động Xử Lý Đơn</CardTitle>
          </div>
          <CardDescription>Bật để hệ thống tự mua nguồn và giao hàng khi phát hiện đơn mới.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
            <div>
              <p className="font-medium text-sm">Kích hoạt tự động</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quét mỗi 5 giây · Đồng bộ kho mỗi 5 phút
              </p>
            </div>
            <Switch checked={localAutoFulfill} onCheckedChange={setLocalAutoFulfill} />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={updateConfig.isPending || localAutoFulfill === config?.autoFulfill}
              size="sm"
              className="gap-2"
            >
              <Save className="h-3.5 w-3.5" />
              {updateConfig.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Thông Tin Kết Nối</CardTitle>
          </div>
          <CardDescription>
            Điền để cập nhật. Để trống thì giữ nguyên. Giá trị không hiển thị vì lý do bảo mật.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Bot token */}
          <Field
            id="botToken"
            label="Telegram Bot Token"
            isSet={config?.mainBotTokenSet}
            hint="Dùng để gửi hàng cho khách qua Telegram."
          >
            <div className="relative max-w-lg">
              <Input
                id="botToken"
                type={showBotToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={config?.mainBotTokenSet ? "••••• (đã cấu hình)" : "1234567890:ABCDEF..."}
                className="font-mono pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowBotToken(v => !v)}
              >
                {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {/* Second bot token */}
          <Field
            id="secondBotToken"
            label="Bot Token Phụ (tiếng Anh / Binance Bot)"
            isSet={config?.secondBotTokenSet}
            hint="Bot dành cho khách nước ngoài. Hệ thống tự dùng bot này nếu bot chính không gửi được."
          >
            <div className="relative max-w-lg">
              <Input
                id="secondBotToken"
                type={showSecondBotToken ? "text" : "password"}
                value={secondBotToken}
                onChange={(e) => setSecondBotToken(e.target.value)}
                placeholder={config?.secondBotTokenSet ? "••••• (đã cấu hình)" : "1234567890:ABCDEF..."}
                className="font-mono pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSecondBotToken(v => !v)}
              >
                {showSecondBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="border-t border-border/60" />

          {/* API URL */}
          <Field
            id="apiUrl"
            label="URL API Nguồn Hàng"
            isSet={config?.sourceBotApiUrlSet}
          >
            <Input
              id="apiUrl"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={config?.sourceBotApiUrlSet ? "đã cấu hình" : "http://node12.zampto.net:20291"}
              className="font-mono max-w-lg"
            />
          </Field>

          {/* API Key */}
          <Field
            id="apiKey"
            label="API Key Nguồn Hàng"
            isSet={config?.sourceBotApiKeySet}
          >
            <div className="relative max-w-lg">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config?.sourceBotApiKeySet ? "••••• (đã cấu hình)" : "sk_..."}
                className="font-mono pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowApiKey(v => !v)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="border-t border-border/60" />

          {/* Admin Chat ID */}
          <Field
            id="adminChatId"
            label="Chat ID Admin"
            isSet={!!config?.adminChatId}
            hint={
              <>
                Nhận thông báo Telegram khi có đơn cần xử lý thủ công.
                Lấy ID qua <code className="font-mono bg-muted px-1 rounded text-[11px]">@userinfobot</code>.
              </>
            }
            icon={Bell}
          >
            <Input
              id="adminChatId"
              value={adminChatId}
              onChange={(e) => setAdminChatId(e.target.value)}
              placeholder={config?.adminChatId ? "đã cấu hình" : "123456789"}
              className="font-mono max-w-lg"
            />
          </Field>

          <div className="border-t border-border/60" />

          {/* Low Balance Threshold */}
          <Field
            id="lowBalanceThreshold"
            label="Ngưỡng cảnh báo số dư thấp (đ)"
            isSet={typeof config?.lowBalanceThreshold === "number"}
            hint={
              <>
                Khi số dư API nguồn thấp hơn mức này, hệ thống sẽ gửi cảnh báo Telegram tới admin (tối đa 1 lần/giờ).
                {typeof config?.lowBalanceThreshold === "number" && (
                  <span className="ml-1 text-foreground font-medium">
                    Hiện tại: {config.lowBalanceThreshold.toLocaleString("vi-VN")}đ
                  </span>
                )}
              </>
            }
            icon={Bell}
          >
            <Input
              id="lowBalanceThreshold"
              type="number"
              min={0}
              value={lowBalanceThreshold}
              onChange={(e) => setLowBalanceThreshold(e.target.value)}
              placeholder={
                typeof config?.lowBalanceThreshold === "number"
                  ? config.lowBalanceThreshold.toLocaleString("vi-VN")
                  : "50000"
              }
              className="font-mono max-w-lg"
            />
          </Field>

          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <div className="flex gap-2">
              <Button
                onClick={handleTestBot}
                disabled={testingBot || !config?.mainBotTokenSet || !config?.adminChatId}
                variant="outline"
                size="sm"
                className="gap-2"
                title={!config?.adminChatId ? "Cần cấu hình Admin Chat ID trước" : ""}
              >
                {testingBot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {testingBot ? "Đang gửi..." : "Test Bot"}
              </Button>
              <Button
                onClick={handleTestApi}
                disabled={testingApi || !config?.sourceBotApiUrlSet || !config?.sourceBotApiKeySet}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {testingApi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                {testingApi ? "Đang kiểm tra..." : "Test API Nguồn"}
              </Button>
            </div>
            <Button
              onClick={handleSaveCredentials}
              disabled={updateConfig.isPending}
              size="sm"
              className="gap-2"
            >
              <Save className="h-3.5 w-3.5" />
              {updateConfig.isPending ? "Đang lưu..." : "Lưu Kết Nối"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Bảo Trì</CardTitle>
          </div>
          <CardDescription>Tạm dừng hệ thống mà không mất cấu hình.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Chế độ bảo trì</p>
              <p className="text-xs text-muted-foreground">Canboso vẫn nhận đơn nhưng poller không xử lý — đơn sẽ được giữ lại và xử lý khi tắt bảo trì.</p>
            </div>
            <Switch
              checked={config?.maintenanceMode ?? false}
              onCheckedChange={handleToggleMaintenance}
              disabled={updateConfig.isPending}
            />
          </div>
          {config?.maintenanceMode && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              Đang bảo trì — poller đã tạm dừng
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="shadow-sm border-destructive/40">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-destructive" />
            <CardTitle className="text-base text-destructive">Vùng Nguy Hiểm</CardTitle>
          </div>
          <CardDescription>Các thao tác không thể hoàn tác. Hãy chắc chắn trước khi thực hiện.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">Xoá tất cả dữ liệu</p>
              <p className="text-xs text-muted-foreground">Xoá toàn bộ đơn hàng, ánh xạ sản phẩm và chợ tự động trên VPS. Cấu hình kết nối giữ nguyên.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2 shrink-0" disabled={deletingAll}>
                  {deletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Xoá hết
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <TriangleAlert className="h-5 w-5" /> Xác nhận xoá toàn bộ dữ liệu
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2 text-left">
                    <span className="block">Hành động này sẽ xoá vĩnh viễn:</span>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Toàn bộ lịch sử đơn hàng</li>
                      <li>Toàn bộ ánh xạ sản phẩm (Ảnh Xạ Sản Phẩm)</li>
                      <li>Toàn bộ chợ tự động đang theo dõi</li>
                    </ul>
                    <span className="block font-semibold text-foreground pt-1">Không thể hoàn tác. Cấu hình kết nối giữ nguyên.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    onClick={handleDeleteAll}
                  >
                    Xác nhận xoá hết
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Poller info */}
      <Card className="shadow-sm bg-muted/30 border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lịch Trình Tự Động</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
            <span>• Quét đơn paid/sentinel: <b className="text-foreground">mỗi 5 giây</b></span>
            <span>• Đồng bộ kho hàng: <b className="text-foreground">mỗi 5 phút</b></span>
            <span>• Thời gian giao hàng: <b className="text-foreground">&lt; 10 giây</b></span>
            <span>• Bỏ qua đơn cũ trước khi khởi động</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({
  label, ok, detail, icon: Icon
}: {
  label: string; ok?: boolean; detail: string; icon: any;
}) {
  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-lg border ${ok ? "border-success/30 bg-success/5" : "border-border bg-muted/30"}`}>
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      }
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate">{label}</p>
        <p className={`text-[11px] font-mono truncate ${ok ? "text-success" : "text-muted-foreground"}`}>{detail}</p>
      </div>
    </div>
  );
}

function Field({
  id, label, isSet, hint, icon: Icon, children
}: {
  id: string; label: string; isSet?: boolean; hint?: React.ReactNode; icon?: any; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
        <span className={`h-1.5 w-1.5 rounded-full ${isSet ? "bg-success" : "bg-muted-foreground/40"}`} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
