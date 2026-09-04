#!/bin/bash
# AYRA · Kurumlara tanıtım yazısı gönderimi
#
# Bu betik önce DENEME yapar: kime hangi metnin gideceğini gösterir, hiçbir şey
# göndermez. Onay verirseniz gerçek gönderimi yapar.
#
# Çift tıklayarak veya Terminal'de çalıştırabilirsiniz.

set -u
cd "$(dirname "$0")/.." || exit 1

ADRES="https://ayraga.com/api/kurum/tanitim"

# CRON_SECRET'i Vercel ortam dosyasından okur; ekrana yazılmaz.
GIZLI="$(grep -m1 '^CRON_SECRET=' vercel-env.txt 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d '[:space:]')"
if [ -z "$GIZLI" ]; then
  printf 'CRON_SECRET bulunamadı.\nDeğeri elle yapıştırın (ekranda görünmez): '
  read -rs GIZLI; echo
fi
[ -z "$GIZLI" ] && { echo "Gizli anahtar yok, çıkılıyor."; exit 1; }

echo
echo "=== DENEME — hiçbir şey gönderilmiyor ==="
curl -s -H "Authorization: Bearer $GIZLI" "$ADRES" | python3 -m json.tool 2>/dev/null \
  || { echo "İstek başarısız."; exit 1; }

echo
echo "Yukarıdaki listeyi okuyun. 'durum: deneme' olan her satıra gerçek bir"
echo "e-posta gidecek. Devam etmek için büyük harfle GONDER yazın:"
read -r CEVAP
[ "$CEVAP" = "GONDER" ] || { echo "Vazgeçildi. Hiçbir şey gönderilmedi."; exit 0; }

echo
echo "=== GERÇEK GÖNDERİM ==="
curl -s -H "Authorization: Bearer $GIZLI" "$ADRES?onay=1" | python3 -m json.tool
echo
echo "Bitti. Kayıtlar: Yönetim → Gönderimler"
