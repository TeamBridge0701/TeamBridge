package com.groupware.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.NoticeDTO;
import com.groupware.mapper.NoticeMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class NoticeService {

	private static final int PAGE_SIZE = 10;

	private final NoticeMapper noticeMapper;

	// 공지 작성/수정/삭제 권한: 관리자 + 팀장/부서장(POSITION_RANK 1~2)
	// (2026-07-15 팀 논의로 관리자 전용에서 확장 - 기획서.md 3.5/4장 반영)

	public boolean canManageNotice(EmployeeDTO employee) {
		if (employee == null) {
			return false;
		}
		return "ADMIN".equals(employee.getEmployeeRole())
				|| (employee.getPositionRank() >= 1 && employee.getPositionRank() <= 2);
	}

	// 수정/삭제 전용 권한: canManageNotice()보다 더 엄격하다 - 관리자는 전체 수정/삭제
	// 가능(시스템 운영자 성격 유지), 팀장/부서장은 본인이 작성한 공지만 수정/삭제 가능
	// (2026-07-15 테스트 중 정진국 결정 - 작성(canManageNotice)과는 별도 기준.
	//  대상 공지가 있어야 판단 가능하므로 작성에는 쓸 수 없음)
	public boolean canModifyNotice(EmployeeDTO employee, NoticeDTO notice) {
		if (employee == null || notice == null) {
			return false;
		}
		if ("ADMIN".equals(employee.getEmployeeRole())) {
			return true;
		}
		boolean isManager = employee.getPositionRank() >= 1 && employee.getPositionRank() <= 2;
		return isManager && employee.getEmployeeId() == notice.getWriterId();
	}

	public List<NoticeDTO> getNoticeList(String keyword, int page) {
		int offset = (page - 1) * PAGE_SIZE;
		return noticeMapper.findNotices(keyword, offset, PAGE_SIZE);
	}

	// 검색 결과가 0건이어도 페이지네이션 UI에 "1페이지"는 표시돼야 하므로 최소 1
	public int getTotalPages(String keyword) {
		int totalCount = noticeMapper.countNotices(keyword);
		return Math.max(1, (int) Math.ceil(totalCount / (double) PAGE_SIZE));
	}

	// 조회수를 먼저 +1 한 뒤 조회해야 화면에 방금 조회한 결과(+1 반영된 값)가 나옴
	public NoticeDTO getNoticeDetail(int noticeId) {
		noticeMapper.incrementViewCount(noticeId);
		return noticeMapper.findNoticeDetail(noticeId);
	}

	// 수정 모달 프리필용 - 조회수를 올리지 않음
	public NoticeDTO getNoticeForEdit(int noticeId) {
		return noticeMapper.findNoticeForEdit(noticeId);
	}

	public void writeNotice(int writerId, String noticeTitle, String noticeContent, boolean isPinned) {
		noticeMapper.insertNotice(writerId, noticeTitle, noticeContent, isPinned);
	}

	public void updateNotice(int noticeId, String noticeTitle, String noticeContent, boolean isPinned) {
		noticeMapper.updateNotice(noticeId, noticeTitle, noticeContent, isPinned);
	}

	public void deleteNotice(int noticeId) {
		noticeMapper.deleteNotice(noticeId);
	}
}
