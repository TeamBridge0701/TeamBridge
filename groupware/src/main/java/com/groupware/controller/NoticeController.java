package com.groupware.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.NoticeDTO;
import com.groupware.service.NoticeService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class NoticeController {

	private final NoticeService noticeService;

	@GetMapping("/notice/list")
	public String noticeList(@RequestParam(value = "keyword", required = false) String keyword,
			@RequestParam(value = "page", defaultValue = "1") int page, Model model) {
		model.addAttribute("notices", noticeService.getNoticeList(keyword, page));
		model.addAttribute("totalPages", noticeService.getTotalPages(keyword));
		model.addAttribute("currentPage", page);
		model.addAttribute("keyword", keyword);
		return "notice/notice";
	}

	// 상세는 페이지 이동이 아니라 목록 화면의 모달(#modal-notice-detail)이
	// fetch로 호출해서 채우는 JSON API (화면설계서.md 04 참고 - 목록 클릭 시 모달 오픈)
	@GetMapping("/notice/detail/{id}")
	@ResponseBody
	public ResponseEntity<NoticeDTO> noticeDetail(@PathVariable("id") int id) {
		NoticeDTO notice = noticeService.getNoticeDetail(id);
		if (notice == null) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(notice);
	}

	// 수정 모달 프리필용 - 조회수를 올리면 안 되므로 noticeDetail()과 별도 API
	// (@ModelAttribute("employee"): GlobalModelAdvice가 이미 만들어둔 값을 그대로 재사용 -
	//  principal.getEmployeeDTO()는 POSITION 조인이 안 돼 있어 positionRank가 항상 0으로 나옴)
	// canModifyNotice는 대상 공지의 WRITER_ID가 있어야 판단 가능하므로 조회를 먼저 함
	@GetMapping("/notice/update/{id}")
	@ResponseBody
	public ResponseEntity<NoticeDTO> noticeEditForm(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		NoticeDTO notice = noticeService.getNoticeForEdit(id);
		if (notice == null) {
			return ResponseEntity.notFound().build();
		}
		if (!noticeService.canModifyNotice(employee, notice)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(notice);
	}

	@PostMapping("/notice/write")
	@ResponseBody
	public ResponseEntity<String> writeNotice(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam("noticeTitle") String noticeTitle, @RequestParam("noticeContent") String noticeContent,
			@RequestParam(value = "isPinned", defaultValue = "false") boolean isPinned) {
		if (!noticeService.canManageNotice(employee)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("작성 권한이 없습니다.");
		}
		noticeService.writeNotice(employee.getEmployeeId(), noticeTitle, noticeContent, isPinned);
		return ResponseEntity.ok("등록되었습니다.");
	}

	// 수정/삭제는 작성(canManageNotice)과 권한 기준이 다르다(canModifyNotice) -
	// 관리자는 전체, 팀장/부서장은 본인이 쓴 공지만. 그래서 대상 공지를 먼저 조회해서
	// WRITER_ID를 확인해야 함
	@PostMapping("/notice/update/{id}")
	@ResponseBody
	public ResponseEntity<String> updateNotice(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id, @RequestParam("noticeTitle") String noticeTitle,
			@RequestParam("noticeContent") String noticeContent,
			@RequestParam(value = "isPinned", defaultValue = "false") boolean isPinned) {
		NoticeDTO notice = noticeService.getNoticeForEdit(id);
		if (notice == null) {
			return ResponseEntity.notFound().build();
		}
		if (!noticeService.canModifyNotice(employee, notice)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("본인이 작성한 공지만 수정할 수 있습니다.");
		}
		noticeService.updateNotice(id, noticeTitle, noticeContent, isPinned);
		return ResponseEntity.ok("수정되었습니다.");
	}

	@PostMapping("/notice/delete/{id}")
	@ResponseBody
	public ResponseEntity<String> deleteNotice(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		NoticeDTO notice = noticeService.getNoticeForEdit(id);
		if (notice == null) {
			return ResponseEntity.notFound().build();
		}
		if (!noticeService.canModifyNotice(employee, notice)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("본인이 작성한 공지만 삭제할 수 있습니다.");
		}
		noticeService.deleteNotice(id);
		return ResponseEntity.ok("삭제되었습니다.");
	}
}
