"""IP アドレスを「同じネットワーク」の単位にまとめる（複数アカウント対策の上限・確認用）。

IPv4 はアドレスそのもの。IPv6 は家庭・スマートフォン 1 台ごとに /64 の範囲が割り当てられ、
その中でアドレスが頻繁に変わる（変えられる）ため、先頭 64 ビットを同じネットワークとして扱う。
"""

import ipaddress

from sqlalchemy import case, cast, func, literal
from sqlalchemy.dialects.postgresql import CIDR, INET


def net_key(ip: str | None) -> str | None:
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    prefix = 64 if addr.version == 6 else 32
    return str(ipaddress.ip_network(f"{addr}/{prefix}", strict=False))


def net_expr(col):
    """SQL：IP アドレスの列を、net_key と同じ単位（CIDR）に変換する。"""
    inet = cast(col, INET)
    return case(
        (func.family(inet) == 6, func.network(func.set_masklen(inet, 64))),
        else_=func.network(func.set_masklen(inet, 32)),
    )


def same_net(col, ip: str):
    key = net_key(ip)
    return net_expr(col) == cast(literal(key), CIDR)
