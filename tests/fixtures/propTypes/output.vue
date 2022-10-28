<script setup lang="ts">
defineProps<{
  string?: string
  number?: number
  boolean?: boolean
  array?: any[]
  object?: object
  date?: Date
  function?: Function
  symbol?: symbol
}>()
</script>