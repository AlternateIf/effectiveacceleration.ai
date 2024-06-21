import { MARKETPLACE_V1_ABI } from "effectiveacceleration-contracts/wagmi/MarketplaceV1";
import Config from "effectiveacceleration-contracts/scripts/config.json";
import { useState, useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";

type CacheCheck = { targetAddress: string, checkedItem: string }

export default function useArbitratorPublicKeys(targetAddresses: string[]) {
  const [publicKeys, setPublicKeys] = useState<Record<string, string>>({});
  const { address } = useAccount();
  const [cachedItems, setCachedItems] = useState<{ targetAddress: string, checkedItem: string }[]>([]);
  const [missedItems, setMissedItems] = useState<{ targetAddress: string, checkedItem: string }[]>([]);

  useEffect(() => {
    const checkedItems = targetAddresses.map((targetAddress) => {
      const checkedItem = localStorage.getItem(`arbitratorPublicKey-${targetAddress}`);
      return {targetAddress, checkedItem };
    });

    const cachedItems = checkedItems.filter(val => val.checkedItem && val.checkedItem !== "undefined") as CacheCheck[];
    const missedItems = checkedItems.filter(val => !val.checkedItem || val.checkedItem === "undefined") as CacheCheck[];
    setCachedItems(cachedItems);
    setMissedItems(missedItems);
  }, [targetAddresses]);

  const result = useReadContracts({
    contracts: missedItems.map(
      (item) => ({
        account:      address,
        abi:          MARKETPLACE_V1_ABI,
        address:      Config.marketplaceAddress as `0x${string}`,
        functionName: 'arbitrators',
        args:         [item.targetAddress],
      })
    ),
  });

  const arbitratorsData = result.data;
  const { data: _, ...rest } = result;

  useEffect(() => {
    // @ts-ignore
    if ((arbitratorsData && Object.keys(arbitratorsData).length) || cachedItems.length > 0) {
      const resultMap: Record<string, string> = {};
      arbitratorsData?.forEach((data, index) => {
        if (data.result) {
          const targetAddress = missedItems[index].targetAddress;
          resultMap[targetAddress] = (data.result as any)[0] as string;

          localStorage.setItem(`arbitratorPublicKey-${targetAddress}`, (data.result as any)[0] as string);
        }
      });

      cachedItems.forEach((item) => {
        resultMap[item.targetAddress] = item.checkedItem as string;
      });
      setPublicKeys(resultMap);
    }
  // @ts-ignore
  }, [arbitratorsData, cachedItems, missedItems]);

  return { data: publicKeys, ...rest };
}
