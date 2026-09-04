#!/bin/bash
# AYRA · Projeyi temiz bir yere topla
#
# Kaynaklar:
#   ~/ayra-vercel        — Vercel'den inen 2 Eylül dağıtımı (gövde)
#   ~/Desktop/ayra       — 2 Eylül'den sonra eklenenler + .env.local
# Hedef:
#   ~/Projeler/ayra      — iCloud'un elinin değmediği yer
#
# Hiçbir şey silinmez; Masaüstündeki klasör olduğu gibi kalır.

set -u
ESKI="$HOME/Desktop/ayra"
VERCEL="$HOME/ayra-vercel"
YENI="$HOME/Projeler/ayra"

[ -d "$VERCEL" ] || { echo "~/ayra-vercel yok. Önce kurtarma betiğini çalıştırın."; exit 1; }

# İçeriği olmayan (dataless) dosyayı okumaya kalkışmak dakikalarca askıda kalır.
bos_mu() { case "$(stat -f '%Sf' "$1" 2>/dev/null)" in *dataless*) return 0 ;; *) return 1 ;; esac; }

kopyala() {  # kopyala <kaynak> <hedef>
  [ -e "$1" ] || return 0
  if bos_mu "$1"; then echo "  atlandı (içeriği yok): ${1#$ESKI/}"; return 0; fi
  mkdir -p "$(dirname "$2")" && cp -p "$1" "$2" && echo "  + ${2#$YENI/}"
}

echo "1) Vercel kopyası yerleştiriliyor…"
mkdir -p "$HOME/Projeler"
rm -rf "$YENI"
cp -R "$VERCEL" "$YENI"
echo "   $(find "$YENI" -type f | wc -l | tr -d ' ') dosya"

echo
echo "2) Dağıtımdan sonra eklenenler:"
for y in \
  supabase/migrations/0022_gonderim_kilidi.sql \
  supabase/migrations/0023_tanitim.sql \
  supabase/migrations/0024_gonderim_onayi.sql \
  src/lib/kurum-tanitim.ts \
  src/lib/kurum-bildirim.ts \
  src/app/api/kurum/tanitim/route.ts \
  .env.local
do
  kopyala "$ESKI/$y" "$YENI/$y"
done

echo
echo "3) _kurulum klasörü:"
mkdir -p "$YENI/_kurulum"
while IFS= read -r f; do
  kopyala "$f" "$YENI/_kurulum/${f#$ESKI/_kurulum/}"
done < <(find "$ESKI/_kurulum" -type f -not -path '*/_to_delete/*')

echo
echo "4) Denetim:"
bos=0
while IFS= read -r f; do bos_mu "$f" && { echo "  ! içeriği yok: ${f#$YENI/}"; bos=$((bos+1)); }; done \
  < <(find "$YENI" -type f -not -path '*/node_modules/*')
echo "   toplam dosya : $(find "$YENI" -type f -not -path '*/node_modules/*' | wc -l | tr -d ' ')"
echo "   içeriği olmayan: $bos"

echo
echo "Bitti → $YENI"
echo "Sıradaki: cd ~/Projeler/ayra && npm install && npx vercel link"
