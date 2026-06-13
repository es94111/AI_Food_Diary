import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/ai_settings_service.dart';

/// Settings card: lets each user bring their own AI API key
/// (OpenAI / Gemini / OpenAI-compatible). The key is sent to the server,
/// stored encrypted, and never returned again.
class AiSettingsCard extends StatefulWidget {
  const AiSettingsCard({super.key});

  @override
  State<AiSettingsCard> createState() => _AiSettingsCardState();
}

class _AiSettingsCardState extends State<AiSettingsCard> {
  final _apiKeyCtrl = TextEditingController();
  final _baseUrlCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();

  String _provider = 'openai';
  bool _hasKey = false;
  bool _obscureKey = true;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  // Models fetched live from the provider; lets the user pick from a list or
  // keep typing their own into the model field.
  List<String> _models = const [];
  bool _loadingModels = false;
  String? _modelMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _apiKeyCtrl.dispose();
    _baseUrlCtrl.dispose();
    _modelCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = await AiSettingsService.fetch();
      if (!mounted) return;
      final provider =
          kAiProviders.any((p) => p.id == s.provider) ? s.provider : 'openai';
      setState(() {
        _provider = provider;
        _hasKey = s.hasKey;
        _baseUrlCtrl.text = s.baseUrl;
        _modelCtrl.text =
            s.model.isNotEmpty ? s.model : aiProviderById(provider).defaultModel;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _onProviderChanged(String? value) {
    if (value == null) return;
    setState(() {
      _provider = value;
      // Reset model/base to the new provider's defaults so the fields stay consistent.
      _modelCtrl.text = aiProviderById(value).defaultModel;
      _baseUrlCtrl.clear();
      // The loaded list belongs to the previous provider/endpoint — drop it.
      _models = const [];
      _modelMessage = null;
    });
  }

  Future<void> _loadModels() async {
    setState(() {
      _loadingModels = true;
      _modelMessage = null;
    });
    try {
      final models = await AiSettingsService.listModels(
        provider: _provider,
        apiKey:
            _apiKeyCtrl.text.trim().isNotEmpty ? _apiKeyCtrl.text.trim() : null,
        baseUrl: _provider == 'compatible' ? _baseUrlCtrl.text.trim() : null,
      );
      if (!mounted) return;
      setState(() {
        _models = models;
        _loadingModels = false;
        _modelMessage = models.isEmpty
            ? '此供應商沒有回傳模型清單，請自行輸入模型名稱。'
            : '已載入 ${models.length} 個模型，可從清單挑選或自行輸入。';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingModels = false;
        _modelMessage = e.toString();
      });
    }
  }

  Future<void> _save() async {
    final def = aiProviderById(_provider);
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final model = _modelCtrl.text.trim().isNotEmpty
          ? _modelCtrl.text.trim()
          : def.defaultModel;
      await AiSettingsService.save(
        provider: _provider,
        apiKey: _apiKeyCtrl.text.trim(),
        baseUrl: _provider == 'compatible' ? _baseUrlCtrl.text.trim() : null,
        model: model,
      );
      if (!mounted) return;
      setState(() {
        _saving = false;
        if (_apiKeyCtrl.text.trim().isNotEmpty) _hasKey = true;
        _apiKeyCtrl.clear();
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已儲存 AI 設定')));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _copyApiKeysUrl() async {
    final url = aiProviderById(_provider).apiKeysUrl;
    if (url.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('已複製金鑰申請網址：$url')));
  }

  @override
  Widget build(BuildContext context) {
    final def = aiProviderById(_provider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('AI 設定',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            const Text('選擇 AI 服務商並輸入你自己的 API 金鑰。金鑰會加密儲存，僅用於分析你的餐點。',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              DropdownButtonFormField<String>(
                initialValue: _provider,
                decoration: const InputDecoration(
                    labelText: 'AI 服務商', border: OutlineInputBorder()),
                items: kAiProviders
                    .map((p) =>
                        DropdownMenuItem(value: p.id, child: Text(p.label)))
                    .toList(),
                onChanged: _onProviderChanged,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _apiKeyCtrl,
                obscureText: _obscureKey,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: 'API 金鑰',
                  hintText: _hasKey ? '已儲存金鑰，留空則維持不變' : '輸入你的 API 金鑰',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(
                        _obscureKey ? Icons.visibility : Icons.visibility_off),
                    onPressed: () =>
                        setState(() => _obscureKey = !_obscureKey),
                  ),
                ),
              ),
              if (def.apiKeysUrl.isNotEmpty)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _copyApiKeysUrl,
                    icon: const Icon(Icons.copy, size: 16),
                    label: Text('複製 ${def.label} 金鑰申請網址'),
                  ),
                ),
              if (_provider == 'compatible') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _baseUrlCtrl,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'API Base URL',
                    hintText: 'https://your-endpoint/v1',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _modelCtrl,
                autocorrect: false,
                inputFormatters: [
                  FilteringTextInputFormatter.deny(RegExp(r'\s')),
                ],
                decoration: InputDecoration(
                  labelText: '模型',
                  hintText: _provider == 'compatible'
                      ? '例如 gpt-4o'
                      : def.defaultModel,
                  helperText: '需支援圖片輸入（vision）才能分析餐點照片。',
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (_loadingModels)
                    const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    OutlinedButton.icon(
                      onPressed: _loadModels,
                      icon: const Icon(Icons.cloud_download_outlined, size: 18),
                      label: const Text('載入模型清單'),
                    ),
                  if (_models.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    PopupMenuButton<String>(
                      tooltip: '從清單選擇模型',
                      onSelected: (value) =>
                          setState(() => _modelCtrl.text = value),
                      itemBuilder: (_) => _models
                          .map((m) => PopupMenuItem<String>(
                                value: m,
                                child: Text(m,
                                    overflow: TextOverflow.ellipsis),
                              ))
                          .toList(),
                      child: Chip(
                        avatar: const Icon(Icons.arrow_drop_down, size: 18),
                        label: Text('選擇 (${_models.length})'),
                      ),
                    ),
                  ],
                ],
              ),
              if (_modelMessage != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(_modelMessage!,
                      style: const TextStyle(
                          fontSize: 12, color: Colors.black54)),
                ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('儲存 AI 設定'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
